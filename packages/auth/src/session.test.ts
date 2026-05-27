import { describe, it, expect } from 'vitest';
import { hashToken, generateRefreshToken } from './session.js';

describe('session tokens', () => {
  it('hashes refresh tokens deterministically for DB lookup', () => {
    const raw = 'test-refresh-token-value';
    expect(hashToken(raw)).toBe(hashToken(raw));
    expect(hashToken(raw)).not.toBe(raw);
  });

  it('generates unique refresh tokens on rotation', () => {
    const a = generateRefreshToken();
    const b = generateRefreshToken();
    expect(a).not.toBe(b);
    expect(hashToken(a)).not.toBe(hashToken(b));
  });
});
