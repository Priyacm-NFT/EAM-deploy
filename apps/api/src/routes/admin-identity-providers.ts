import type { FastifyInstance } from 'fastify';
import { eq, and } from 'drizzle-orm';
import { encryptIdpConfig, decryptIdpConfig, LdapSyncService } from '@eam/auth';
import { db, identityProviders, audit } from '@eam/db';
import { requirePermission } from '../plugins/auth.js';

export async function adminIdentityProviderRoutes(app: FastifyInstance) {
  const guard = { preHandler: requirePermission('admin:users:manage') };

  app.get('/admin/identity-providers', guard, async (request) => {
    const list = await db
      .select()
      .from(identityProviders)
      .where(eq(identityProviders.tenantId, request.user!.tenantId));
    return list.map((p) => ({
      ...p,
      config: { configured: true },
    }));
  });

  app.post('/admin/identity-providers', guard, async (request, reply) => {
    const body = request.body as {
      type: 'SAML' | 'OIDC' | 'LDAP' | 'AD';
      name: string;
      config: Record<string, unknown>;
      isActive?: boolean;
    };
    const encrypted = encryptIdpConfig(body.config);
    const [provider] = await db
      .insert(identityProviders)
      .values({
        tenantId: request.user!.tenantId,
        type: body.type,
        name: body.name,
        config: { _encrypted: encrypted },
        isActive: body.isActive ?? true,
      })
      .returning();
    await audit(db, {
      tenantId: request.user!.tenantId,
      userId: request.user!.id,
      action: 'IDP_CREATED',
      resource: 'identity_providers',
      resourceId: provider!.id,
    });
    return reply.status(201).send(provider);
  });

  app.put('/admin/identity-providers/:id', guard, async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = request.body as {
      name?: string;
      config?: Record<string, unknown>;
      isActive?: boolean;
    };
    const updates: Partial<typeof identityProviders.$inferInsert> = {};
    if (body.name) updates.name = body.name;
    if (body.isActive !== undefined) updates.isActive = body.isActive;
    if (body.config) updates.config = { _encrypted: encryptIdpConfig(body.config) };

    const [provider] = await db
      .update(identityProviders)
      .set(updates)
      .where(and(eq(identityProviders.id, id), eq(identityProviders.tenantId, request.user!.tenantId)))
      .returning();
    if (!provider) return reply.status(404).send({ error: 'Not found' });
    return provider;
  });

  app.delete('/admin/identity-providers/:id', guard, async (request, reply) => {
    const { id } = request.params as { id: string };
    await db
      .update(identityProviders)
      .set({ isActive: false })
      .where(and(eq(identityProviders.id, id), eq(identityProviders.tenantId, request.user!.tenantId)));
    return reply.send({ ok: true });
  });

  app.post('/admin/identity-providers/:id/test', guard, async (request, reply) => {
    const { id } = request.params as { id: string };
    const [provider] = await db
      .select()
      .from(identityProviders)
      .where(and(eq(identityProviders.id, id), eq(identityProviders.tenantId, request.user!.tenantId)))
      .limit(1);
    if (!provider) return reply.status(404).send({ error: 'Not found' });

    if (provider.type === 'LDAP' || provider.type === 'AD') {
      try {
        const sync = new LdapSyncService(db);
        const result = await sync.syncProvider(id);
        return reply.send({ ok: true, result });
      } catch (e) {
        return reply.status(400).send({ error: String(e) });
      }
    }

    const config = decryptIdpConfig(provider.config);
    return reply.send({ ok: true, type: provider.type, configKeys: Object.keys(config) });
  });
}
