import { describe, it, expect } from 'vitest';
import {
  hashPassword,
  verifyPassword,
  validatePasswordPolicy,
  shouldLockout,
  isPasswordExpired,
} from './password.js';

describe('password policy', () => {
  it('enforces min length', () => {
    const r = validatePasswordPolicy('short1!');
    expect(r.valid).toBe(false);
  });

  it('accepts valid password', () => {
    const r = validatePasswordPolicy('ValidPass1!');
    expect(r.valid).toBe(true);
  });

  it('locks out after N failures', () => {
    expect(shouldLockout(5)).toBe(true);
    expect(shouldLockout(4)).toBe(false);
  });

  it('detects expired password by maxAgeDays', () => {
    const old = new Date(Date.now() - 91 * 24 * 60 * 60 * 1000);
    expect(isPasswordExpired(old, old, 90)).toBe(true);
    expect(isPasswordExpired(new Date(), new Date(), 90)).toBe(false);
    expect(isPasswordExpired(null, old, 90)).toBe(true);
  });
});

describe('argon2id', () => {
  it('hashes and verifies', async () => {
    const hash = await hashPassword('ValidPass1!');
    expect(await verifyPassword(hash, 'ValidPass1!')).toBe(true);
    expect(await verifyPassword(hash, 'wrong')).toBe(false);
  });
});
