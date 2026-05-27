import * as argon2 from 'argon2';
import type { PasswordPolicy } from './types.js';
import { DEFAULT_PASSWORD_POLICY } from './types.js';

export async function hashPassword(password: string): Promise<string> {
  return argon2.hash(password, { type: argon2.argon2id });
}

export async function verifyPassword(hash: string, password: string): Promise<boolean> {
  try {
    return await argon2.verify(hash, password);
  } catch {
    return false;
  }
}

export function validatePasswordPolicy(
  password: string,
  policy: PasswordPolicy = DEFAULT_PASSWORD_POLICY,
): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  if (password.length < policy.minLength) {
    errors.push(`Password must be at least ${policy.minLength} characters`);
  }
  if (policy.requireUppercase && !/[A-Z]/.test(password)) {
    errors.push('Password must contain an uppercase letter');
  }
  if (policy.requireNumber && !/[0-9]/.test(password)) {
    errors.push('Password must contain a number');
  }
  if (policy.requireSpecial && !/[^A-Za-z0-9]/.test(password)) {
    errors.push('Password must contain a special character');
  }
  return { valid: errors.length === 0, errors };
}

export function shouldLockout(
  failedAttempts: number,
  policy: PasswordPolicy = DEFAULT_PASSWORD_POLICY,
): boolean {
  return failedAttempts >= policy.lockoutAfterFailures;
}

export function lockoutDurationMs(): number {
  return 15 * 60 * 1000;
}

export function isPasswordExpired(
  passwordChangedAt: Date | null | undefined,
  accountCreatedAt: Date,
  maxAgeDays: number,
  now = new Date(),
): boolean {
  if (maxAgeDays <= 0) return false;
  const reference = passwordChangedAt ?? accountCreatedAt;
  const maxAgeMs = maxAgeDays * 24 * 60 * 60 * 1000;
  return now.getTime() - reference.getTime() > maxAgeMs;
}
