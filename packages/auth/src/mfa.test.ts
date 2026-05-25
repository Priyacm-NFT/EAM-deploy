import { describe, it, expect } from 'vitest';
import { authenticator } from 'otplib';
import {
  generateTotpSecret,
  verifyTotp,
  encryptSecret,
  decryptSecret,
  generateRecoveryCodes,
  hashRecoveryCode,
} from './mfa.js';

describe('MFA', () => {
  it('verifies TOTP round-trip', () => {
    const secret = generateTotpSecret();
    const token = authenticator.generate(secret);
    expect(verifyTotp(secret, token)).toBe(true);
  });

  it('encrypts and decrypts secrets', () => {
    const enc = encryptSecret('test-secret');
    expect(decryptSecret(enc)).toBe('test-secret');
  });

  it('hashes recovery codes consistently', () => {
    const code = 'ABCD1234';
    expect(hashRecoveryCode(code)).toBe(hashRecoveryCode(code));
    expect(generateRecoveryCodes(3)).toHaveLength(3);
  });
});
