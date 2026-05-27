import { describe, it, expect } from 'vitest';
import type { LdapConfig, LdapSyncResult } from './ldap-sync.js';

describe('LdapConfig types', () => {
  it('accepts documented config shape', () => {
    const config: LdapConfig = {
      url: 'ldap://localhost:389',
      bindDn: 'cn=admin,dc=example,dc=com',
      bindPassword: 'secret',
      baseDn: 'dc=example,dc=com',
      groupBaseDn: 'ou=groups,dc=example,dc=com',
      userFilter: '(objectClass=person)',
      groupFilter: '(objectClass=group)',
      tls: false,
      attrMap: {
        displayName: 'cn',
        email: 'mail',
        department: 'department',
        manager: 'manager',
      },
      lastSyncAt: '2026-01-01T00:00:00.000Z',
      cronExpression: '0 */6 * * *',
    };
    expect(config.baseDn).toBe('dc=example,dc=com');
  });

  it('documents sync result metadata', () => {
    const result: LdapSyncResult = {
      added: 1,
      updated: 2,
      deactivated: 0,
      groups: 3,
      memberships: 4,
      errors: [],
      durationMs: 100,
    };
    expect(result.memberships).toBe(4);
  });
});
