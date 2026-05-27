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

describe('MFA TOTP', () => {
  it('verifies TOTP round-trip', () => {
    const secret = generateTotpSecret();
    const token = authenticator.generate(secret);
    expect(verifyTotp(secret, token)).toBe(true);
    expect(verifyTotp(secret, '000000')).toBe(false);
  });

  it('encrypts and decrypts secrets with AES-256-GCM', () => {
    const secret = generateTotpSecret();
    const enc = encryptSecret(secret);
    expect(enc).not.toContain(secret);
    expect(decryptSecret(enc)).toBe(secret);
  });

  it('generates and hashes recovery codes', () => {
    const codes = generateRecoveryCodes(10);
    expect(codes).toHaveLength(10);
    expect(new Set(codes).size).toBe(10);
    const hash = hashRecoveryCode(codes[0]!);
    expect(hashRecoveryCode(codes[0]!)).toBe(hash);
    expect(hashRecoveryCode('OTHER')).not.toBe(hash);
  });

  it('simulates setup → verify → disable flow', () => {
    const secret = generateTotpSecret();
    const setupToken = authenticator.generate(secret);
    expect(verifyTotp(secret, setupToken)).toBe(true);

    const stored = encryptSecret(secret);
    const loginToken = authenticator.generate(decryptSecret(stored));
    expect(verifyTotp(decryptSecret(stored), loginToken)).toBe(true);

    const recovery = generateRecoveryCodes(2);
    expect(recovery.every((c) => c.length > 0)).toBe(true);
  });
});
