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

export interface JwtPayload {
  sub: string;
  tenantId: string;
  email: string;
  roles: string[];
  permissions: string[];
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
  sessionId?: string;
  mfaVerified?: boolean;
}
