export type AuthSource = 'LOCAL' | 'AD' | 'LDAP' | 'SAML' | 'OIDC';

export interface TenantContext {
  tenantId: string;
  userId: string;
  email: string;
  roles: string[];
  permissions: string[];
}

export interface NotificationEvent {
  type: string;
  entityType: string;
  entityId: string;
  tenantId: string;
  actorId: string;
  data: Record<string, unknown>;
}

export interface ValidationResult {
  valid: boolean;
  errors: Array<{ field_key: string; message: string }>;
}
