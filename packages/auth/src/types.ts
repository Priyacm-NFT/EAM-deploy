export interface PasswordPolicy {
  minLength: number;
  requireUppercase: boolean;
  requireNumber: boolean;
  requireSpecial: boolean;
  maxAgeDays: number;
  lockoutAfterFailures: number;
}

export const DEFAULT_PASSWORD_POLICY: PasswordPolicy = {
  minLength: 10,
  requireUppercase: true,
  requireNumber: true,
  requireSpecial: true,
  maxAgeDays: 90,
  lockoutAfterFailures: 5,
};

// FIX: PRD §8.1 — "Data scoping: Roles scoped to organisation, site, or
// location." This shape mirrors EffectiveScope from packages/auth/src/permissions.ts
// (duplicated here rather than imported, to avoid a circular dependency
// between types.ts and permissions.ts within the same package).
export interface JwtScope {
  unrestricted: boolean;
  organisationIds: string[];
  siteIds: string[];
  locationIds: string[];
}

export interface JwtPayload {
  sub: string;
  tenantId: string;
  email: string;
  roles: string[];
  permissions: string[];
  scope?: JwtScope;
  type: 'access' | 'refresh' | 'mfa';
  sid?: string;
  mfa_verified?: boolean;
}

export interface AuthUser {
  id: string;
  tenantId: string;
  email: string;
  displayName: string;
  roles: string[];
  permissions: string[];
  scope?: JwtScope;
  sessionId?: string;
  mfaVerified?: boolean;
}
