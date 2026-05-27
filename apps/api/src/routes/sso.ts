import type { FastifyInstance } from 'fastify';
import { eq, and } from 'drizzle-orm';
import * as samlify from 'samlify';
import * as openidClient from 'openid-client';
import { randomBytes } from 'node:crypto';
import { db, identityProviders, tenants } from '@eam/db';
import { decryptIdpConfig, mapClaims, upsertSsoUser } from '@eam/auth';
import { issueTokens, getUserAgent } from '../lib/tokens.js';
import { redisSetex, redisGet } from '../lib/redis.js';

const oidcStates = new Map<string, { providerId: string; codeVerifier: string }>();

export async function ssoRoutes(app: FastifyInstance) {
  app.get('/auth/sso/providers', async (request) => {
    const tenantSlug = (request.query as { tenant?: string }).tenant ?? 'default';
    const [tenant] = await db.select().from(tenants).where(eq(tenants.slug, tenantSlug)).limit(1);
    if (!tenant) return [];

    const list = await db
      .select({ id: identityProviders.id, name: identityProviders.name, type: identityProviders.type })
      .from(identityProviders)
      .where(and(eq(identityProviders.tenantId, tenant.id), eq(identityProviders.isActive, true)));

    return list.filter((p) => p.type === 'SAML' || p.type === 'OIDC');
  });

  app.get('/auth/saml/:providerId/metadata', async (request, reply) => {
    const { providerId } = request.params as { providerId: string };
    const provider = await loadProvider(providerId);
    if (!provider || provider.type !== 'SAML') return reply.status(404).send({ error: 'Provider not found' });

    const config = decryptIdpConfig(provider.config);
    const entityId = String(config.spEntityId ?? `${process.env.API_URL ?? 'http://localhost:3000'}/auth/saml/${providerId}`);
    const acsUrl = String(config.acsUrl ?? `${process.env.API_URL ?? 'http://localhost:3000'}/auth/saml/${providerId}/callback`);

    const metadata = `<?xml version="1.0"?>
<EntityDescriptor entityID="${entityId}" xmlns="urn:oasis:names:tc:SAML:2.0:metadata">
  <SPSSODescriptor AuthnRequestsSigned="false" WantAssertionsSigned="true" protocolSupportEnumeration="urn:oasis:names:tc:SAML:2.0:protocol">
    <AssertionConsumerService Binding="urn:oasis:names:tc:SAML:2.0:bindings:HTTP-POST" Location="${acsUrl}" index="0" isDefault="true"/>
  </SPSSODescriptor>
</EntityDescriptor>`;

    reply.type('application/xml').send(metadata);
  });

  app.get('/auth/saml/:providerId/login', async (request, reply) => {
    const { providerId } = request.params as { providerId: string };
    const provider = await loadProvider(providerId);
    if (!provider || provider.type !== 'SAML') return reply.status(404).send({ error: 'Provider not found' });

    const config = decryptIdpConfig(provider.config);
    const idp = samlify.IdentityProvider({
      metadata: String(config.idpMetadata ?? ''),
    });
    const sp = samlify.ServiceProvider({
      entityID: String(config.spEntityId ?? 'eam-sp'),
      assertionConsumerService: [
        {
          Binding: samlify.Constants.namespace.binding.post,
          Location: String(
            config.acsUrl ?? `${process.env.API_URL ?? 'http://localhost:3000'}/auth/saml/${providerId}/callback`,
          ),
        },
      ],
    });

    const { context } = sp.createLoginRequest(idp, 'redirect');
    return reply.redirect(context);
  });

  app.post('/auth/saml/:providerId/callback', async (request, reply) => {
    const { providerId } = request.params as { providerId: string };
    const provider = await loadProvider(providerId);
    if (!provider || provider.type !== 'SAML') return reply.status(404).send({ error: 'Provider not found' });

    const body = request.body as { SAMLResponse?: string };
    const config = decryptIdpConfig(provider.config);
    const claimsMap = (config.claims_map ?? {}) as Record<string, string>;

    try {
      const idp = samlify.IdentityProvider({ metadata: String(config.idpMetadata ?? '') });
      const sp = samlify.ServiceProvider({
        entityID: String(config.spEntityId ?? 'eam-sp'),
        assertionConsumerService: [
          {
            Binding: samlify.Constants.namespace.binding.post,
            Location: String(
              config.acsUrl ?? `${process.env.API_URL ?? 'http://localhost:3000'}/auth/saml/${providerId}/callback`,
            ),
          },
        ],
      });
      const { extract } = await sp.parseLoginResponse(idp, 'post', { body });
      const attrs = extract.attributes as Record<string, unknown>;
      const mapped = mapClaims({ ...attrs, nameID: extract.nameID }, claimsMap);
      const user = await upsertSsoUser(db, provider.tenantId, 'SAML', mapped);
      return issueTokens(user, { ip: request.ip, userAgent: getUserAgent(request), mfaVerified: false });
    } catch (err) {
      request.log.error(err);
      return reply.status(401).send({ error: 'SAML assertion invalid' });
    }
  });

  app.get('/auth/oidc/:providerId/login', async (request, reply) => {
    const { providerId } = request.params as { providerId: string };
    const provider = await loadProvider(providerId);
    if (!provider || provider.type !== 'OIDC') return reply.status(404).send({ error: 'Provider not found' });

    const config = decryptIdpConfig(provider.config);
    const issuerUrl = String(config.issuerUrl ?? '');
    const clientId = String(config.clientId ?? '');
    const redirectUri = String(
      config.redirectUri ?? `${process.env.API_URL ?? 'http://localhost:3000'}/auth/oidc/${providerId}/callback`,
    );
    const issuer = await openidClient.discovery(new URL(issuerUrl), clientId);
    const codeVerifier = openidClient.randomPKCECodeVerifier();
    const codeChallenge = await openidClient.calculatePKCECodeChallenge(codeVerifier);
    const state = randomBytes(16).toString('hex');
    oidcStates.set(state, { providerId, codeVerifier });
    await redisSetex(`oidc:state:${state}`, 600, JSON.stringify({ providerId, codeVerifier }));

    const authUrl = openidClient.buildAuthorizationUrl(issuer, {
      redirect_uri: redirectUri,
      scope: 'openid email profile',
      code_challenge: codeChallenge,
      code_challenge_method: 'S256',
      state,
    });

    return reply.redirect(authUrl.href);
  });

  app.get('/auth/oidc/:providerId/callback', async (request, reply) => {
    const { providerId } = request.params as { providerId: string };
    const provider = await loadProvider(providerId);
    if (!provider || provider.type !== 'OIDC') return reply.status(404).send({ error: 'Provider not found' });

    const query = request.query as { code?: string; state?: string };
    const stateRaw = query.state ? await redisGet(`oidc:state:${query.state}`) : null;
    const stateData = stateRaw
      ? (JSON.parse(stateRaw) as { providerId: string; codeVerifier: string })
      : oidcStates.get(query.state ?? '');

    if (!stateData || stateData.providerId !== providerId || !query.code) {
      return reply.status(400).send({ error: 'Invalid OIDC state' });
    }

    const config = decryptIdpConfig(provider.config);
    const issuerUrl = String(config.issuerUrl ?? '');
    const clientId = String(config.clientId ?? '');
    const clientSecret = String(config.clientSecret ?? '');
    const redirectUri = String(
      config.redirectUri ?? `${process.env.API_URL ?? 'http://localhost:3000'}/auth/oidc/${providerId}/callback`,
    );

    const issuer = await openidClient.discovery(new URL(issuerUrl), clientId, clientSecret);
    const callbackUrl = new URL(redirectUri);
    callbackUrl.search = new URL(request.url, process.env.API_URL ?? 'http://localhost:3000').search;
    const tokens = await openidClient.authorizationCodeGrant(issuer, callbackUrl, {
      pkceCodeVerifier: stateData.codeVerifier,
      expectedState: query.state,
    });

    const claims = tokens.claims();
    const claimsMap = (config.claims_map ?? {}) as Record<string, string>;
    const mapped = mapClaims(claims as Record<string, unknown>, claimsMap);
    const user = await upsertSsoUser(db, provider.tenantId, 'OIDC', mapped);
    return issueTokens(user, { ip: request.ip, userAgent: getUserAgent(request), mfaVerified: false });
  });
}

async function loadProvider(providerId: string) {
  const [provider] = await db
    .select()
    .from(identityProviders)
    .where(eq(identityProviders.id, providerId))
    .limit(1);
  if (!provider?.isActive) return null;
  return provider;
}
