import ldap from 'ldapjs';
import { eq, and } from 'drizzle-orm';
import type { Database } from '@eam/db';
import { identityProviders, users, groups, userGroups } from '@eam/db';
import { decryptIdpConfig } from './sso.js';

export interface LdapConfig {
  url: string;
  bindDn: string;
  bindPassword: string;
  baseDn: string;
  userFilter?: string;
  groupFilter?: string;
  tls?: boolean;
}

export class LdapSyncService {
  constructor(private readonly db: Database) {}

  async syncProvider(providerId: string): Promise<{ users: number; groups: number }> {
    const [provider] = await this.db
      .select()
      .from(identityProviders)
      .where(eq(identityProviders.id, providerId))
      .limit(1);

    if (!provider || !provider.isActive) {
      throw new Error('Provider not found or inactive');
    }
    if (provider.type !== 'LDAP' && provider.type !== 'AD') {
      throw new Error('Not an LDAP/AD provider');
    }

    const config = decryptIdpConfig(provider.config) as unknown as LdapConfig;
    const client = ldap.createClient({ url: config.url, tlsOptions: config.tls ? {} : undefined });

    await new Promise<void>((resolve, reject) => {
      client.bind(config.bindDn, config.bindPassword, (err: Error | null) =>
        err ? reject(err) : resolve(),
      );
    });

    let userCount = 0;
    let groupCount = 0;

    try {
      const userFilter = config.userFilter ?? '(objectClass=person)';
      const entries = await this.search(client, config.baseDn, userFilter);

      for (const entry of entries) {
        const email = String(entry.mail ?? entry.userPrincipalName ?? '');
        if (!email) continue;

        const externalId = String(entry.dn ?? email);
        const displayName = String(entry.cn ?? entry.displayName ?? email);

        const [existing] = await this.db
          .select()
          .from(users)
          .where(
            and(eq(users.tenantId, provider.tenantId), eq(users.externalId, externalId)),
          )
          .limit(1);

        if (existing) {
          await this.db
            .update(users)
            .set({ email, displayName, authSource: provider.type === 'AD' ? 'AD' : 'LDAP', isActive: true })
            .where(eq(users.id, existing.id));
        } else {
          await this.db.insert(users).values({
            tenantId: provider.tenantId,
            email,
            username: email.split('@')[0] ?? email,
            displayName,
            authSource: provider.type === 'AD' ? 'AD' : 'LDAP',
            externalId,
            passwordHash: null,
          });
        }
        userCount++;
      }

      const groupFilter = config.groupFilter ?? '(objectClass=group)';
      const groupEntries = await this.search(client, config.baseDn, groupFilter);
      for (const g of groupEntries) {
        const name = String(g.cn ?? '');
        if (!name) continue;
        const externalDn = String(g.dn ?? name);

        const [existingGroup] = await this.db
          .select()
          .from(groups)
          .where(and(eq(groups.tenantId, provider.tenantId), eq(groups.externalDn, externalDn)))
          .limit(1);

        if (!existingGroup) {
          await this.db.insert(groups).values({
            tenantId: provider.tenantId,
            name,
            source: provider.type === 'AD' ? 'AD' : 'LDAP',
            externalDn,
          });
        }
        groupCount++;
      }

      await this.db
        .update(identityProviders)
        .set({ lastSyncAt: new Date() })
        .where(eq(identityProviders.id, providerId));
    } finally {
      client.unbind(() => undefined);
    }

    return { users: userCount, groups: groupCount };
  }

  private search(
    client: ldap.Client,
    baseDn: string,
    filter: string,
  ): Promise<Record<string, unknown>[]> {
    return new Promise((resolve, reject) => {
      const results: Record<string, unknown>[] = [];
      client.search(
        baseDn,
        { filter, scope: 'sub', attributes: ['*'] },
        (err: Error | null, res: ldap.SearchCallbackResponse) => {
          if (err) return reject(err);
          res.on('searchEntry', (entry: ldap.SearchEntry) => {
            const raw = entry as unknown as {
              object?: Record<string, unknown>;
              objectName?: string;
              pojo?: { attributes: Array<{ name: string; values: string[] }>; dn: string };
            };
            const obj: Record<string, unknown> = { ...(raw.object ?? {}) };
            if (raw.pojo) {
              for (const attr of raw.pojo.attributes) {
                obj[attr.name] = attr.values.length === 1 ? attr.values[0] : attr.values;
              }
              obj.dn = raw.pojo.dn;
            } else {
              obj.dn = raw.objectName;
            }
            results.push(obj);
          });
          res.on('error', reject);
          res.on('end', () => resolve(results));
        },
      );
    });
  }

  async syncAllActive(): Promise<void> {
    const providers = await this.db
      .select()
      .from(identityProviders)
      .where(eq(identityProviders.isActive, true));

    for (const p of providers) {
      if (p.type === 'LDAP' || p.type === 'AD') {
        try {
          await this.syncProvider(p.id);
        } catch (e) {
          console.error(`[ldap-sync] provider ${p.id} failed:`, e);
        }
      }
    }
  }
}

export async function upsertSsoUser(
  db: Database,
  tenantId: string,
  authSource: 'SAML' | 'OIDC',
  attrs: { email: string; displayName: string; externalId: string; groupNames: string[] },
): Promise<typeof users.$inferSelect> {
  const [byExternal] = await db
    .select()
    .from(users)
    .where(and(eq(users.tenantId, tenantId), eq(users.externalId, attrs.externalId)))
    .limit(1);

  let user = byExternal;
  if (!user) {
    const [byEmail] = await db
      .select()
      .from(users)
      .where(and(eq(users.tenantId, tenantId), eq(users.email, attrs.email)))
      .limit(1);
    user = byEmail;
  }

  if (user) {
    const [updated] = await db
      .update(users)
      .set({
        email: attrs.email,
        displayName: attrs.displayName,
        externalId: attrs.externalId,
        authSource,
        isActive: true,
      })
      .where(eq(users.id, user.id))
      .returning();
    user = updated!;
  } else {
    const [created] = await db
      .insert(users)
      .values({
        tenantId,
        email: attrs.email,
        username: attrs.email.split('@')[0] ?? attrs.email,
        displayName: attrs.displayName,
        externalId: attrs.externalId,
        authSource,
        passwordHash: null,
      })
      .returning();
    user = created!;
  }

  for (const groupName of attrs.groupNames) {
    const [g] = await db
      .select()
      .from(groups)
      .where(and(eq(groups.tenantId, tenantId), eq(groups.name, groupName)))
      .limit(1);
    if (g) {
      await db
        .insert(userGroups)
        .values({ userId: user.id, groupId: g.id })
        .onConflictDoNothing();
    }
  }

  return user;
}
