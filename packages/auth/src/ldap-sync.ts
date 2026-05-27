import ldap from 'ldapjs';
import { eq, and } from 'drizzle-orm';
import type { Database } from '@eam/db';
import { identityProviders, users, groups, userGroups, audit } from '@eam/db';
import { decryptIdpConfig, encryptIdpConfig } from './sso.js';

/** LDAP/AD provider config stored in identity_providers.config (jsonb, encrypted at rest). */
export interface LdapConfig {
  url: string;
  bindDn: string;
  bindPassword: string;
  /** Base DN for user search */
  baseDn: string;
  /** Base DN for group search (defaults to baseDn) */
  groupBaseDn?: string;
  userFilter?: string;
  groupFilter?: string;
  tls?: boolean;
  /** Maps EAM field → LDAP attribute name */
  attrMap?: {
    displayName?: string;
    email?: string;
    department?: string;
    manager?: string;
  };
  /** ISO timestamp of last successful sync (managed by sync) */
  lastSyncAt?: string;
  cronExpression?: string;
}

export interface LdapSyncResult {
  added: number;
  updated: number;
  deactivated: number;
  groups: number;
  memberships: number;
  errors: string[];
  durationMs: number;
}

function ldapValues(value: unknown): string[] {
  if (value == null) return [];
  if (Array.isArray(value)) return value.map(String);
  return [String(value)];
}

function readAttr(entry: Record<string, unknown>, attr: string): string {
  const v = entry[attr];
  if (Array.isArray(v)) return String(v[0] ?? '');
  return v != null ? String(v) : '';
}

export class LdapSyncService {
  constructor(private readonly db: Database) {}

  async syncProvider(providerId: string): Promise<LdapSyncResult> {
    const started = Date.now();
    const result: LdapSyncResult = {
      added: 0,
      updated: 0,
      deactivated: 0,
      groups: 0,
      memberships: 0,
      errors: [],
      durationMs: 0,
    };

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
    const attrMap = {
      displayName: config.attrMap?.displayName ?? 'cn',
      email: config.attrMap?.email ?? 'mail',
      department: config.attrMap?.department ?? 'department',
      manager: config.attrMap?.manager ?? 'manager',
    };

    const client = ldap.createClient({ url: config.url, tlsOptions: config.tls ? {} : undefined });

    await new Promise<void>((resolve, reject) => {
      client.bind(config.bindDn, config.bindPassword, (err: Error | null) =>
        err ? reject(err) : resolve(),
      );
    });

    const syncedExternalIds = new Set<string>();
    const authSource = provider.type === 'AD' ? 'AD' : 'LDAP';

    try {
      let userFilter = config.userFilter ?? '(objectClass=person)';
      if (config.lastSyncAt) {
        const ts = config.lastSyncAt.replace(/[-:TZ.]/g, '').slice(0, 14);
        userFilter = `(&${userFilter}(modifyTimestamp>=${ts}.0Z))`;
      }

      const userEntries = await this.search(client, config.baseDn, userFilter);

      for (const entry of userEntries) {
        try {
          const email =
            readAttr(entry, attrMap.email) ||
            readAttr(entry, 'userPrincipalName') ||
            readAttr(entry, 'mail');
          if (!email) continue;

          const externalId = readAttr(entry, 'dn') || String(entry.dn ?? email);
          const displayName =
            readAttr(entry, attrMap.displayName) || readAttr(entry, 'cn') || email;

          syncedExternalIds.add(externalId);

          const [existing] = await this.db
            .select()
            .from(users)
            .where(and(eq(users.tenantId, provider.tenantId), eq(users.externalId, externalId)))
            .limit(1);

          if (existing) {
            await this.db
              .update(users)
              .set({
                email,
                displayName,
                department: readAttr(entry, attrMap.department) || existing.department,
                authSource,
                isActive: true,
              })
              .where(eq(users.id, existing.id));
            result.updated++;
          } else {
            await this.db.insert(users).values({
              tenantId: provider.tenantId,
              email,
              username: email.split('@')[0] ?? email,
              displayName,
              department: readAttr(entry, attrMap.department) || null,
              authSource,
              externalId,
              passwordHash: null,
            });
            result.added++;
          }
        } catch (e) {
          result.errors.push(e instanceof Error ? e.message : String(e));
        }
      }

      const groupBase = config.groupBaseDn ?? config.baseDn;
      const groupFilter = config.groupFilter ?? '(objectClass=group)';
      const groupEntries = await this.search(client, groupBase, groupFilter);

      for (const g of groupEntries) {
        try {
          const name = readAttr(g, 'cn');
          if (!name) continue;
          const externalDn = readAttr(g, 'dn') || String(g.dn ?? name);

          let [groupRow] = await this.db
            .select()
            .from(groups)
            .where(and(eq(groups.tenantId, provider.tenantId), eq(groups.externalDn, externalDn)))
            .limit(1);

          if (!groupRow) {
            [groupRow] = await this.db
              .insert(groups)
              .values({
                tenantId: provider.tenantId,
                name,
                source: authSource === 'AD' ? 'AD' : 'LDAP',
                externalDn,
              })
              .returning();
          }
          result.groups++;

          const memberDns = [
            ...ldapValues(g.member),
            ...ldapValues(g.uniqueMember),
          ];

          for (const memberDn of memberDns) {
            const [memberUser] = await this.db
              .select({ id: users.id })
              .from(users)
              .where(
                and(eq(users.tenantId, provider.tenantId), eq(users.externalId, memberDn)),
              )
              .limit(1);
            if (!memberUser) continue;

            await this.db
              .insert(userGroups)
              .values({ userId: memberUser.id, groupId: groupRow!.id })
              .onConflictDoNothing();
            result.memberships++;
          }
        } catch (e) {
          result.errors.push(e instanceof Error ? e.message : String(e));
        }
      }

      const ldapUsers = await this.db
        .select({ id: users.id, externalId: users.externalId, authSource: users.authSource })
        .from(users)
        .where(and(eq(users.tenantId, provider.tenantId), eq(users.isActive, true)));

      for (const u of ldapUsers) {
        if (!u.externalId || (u.authSource !== 'AD' && u.authSource !== 'LDAP')) continue;
        if (!syncedExternalIds.has(u.externalId)) {
          await this.db.update(users).set({ isActive: false }).where(eq(users.id, u.id));
          result.deactivated++;
        }
      }

      const nextConfig: LdapConfig = {
        ...config,
        lastSyncAt: new Date().toISOString(),
      };
      await this.db
        .update(identityProviders)
        .set({ config: { _encrypted: encryptIdpConfig(nextConfig as unknown as Record<string, unknown>) } })
        .where(eq(identityProviders.id, providerId));
    } finally {
      client.unbind(() => undefined);
    }

    result.durationMs = Date.now() - started;

    await audit(this.db, {
      tenantId: provider.tenantId,
      action: 'LDAP_SYNC',
      resource: 'identity_providers',
      resourceId: providerId,
      metadata: result as unknown as Record<string, unknown>,
    });

    return result;
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
