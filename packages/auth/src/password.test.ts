import { describe, it, expect } from 'vitest';
import {
  hashPassword,
  verifyPassword,
  validatePasswordPolicy,
  shouldLockout,
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
});

describe('argon2id', () => {
  it('hashes and verifies', async () => {
    const hash = await hashPassword('ValidPass1!');
    expect(await verifyPassword(hash, 'ValidPass1!')).toBe(true);
    expect(await verifyPassword(hash, 'wrong')).toBe(false);
  });
});
