import { describe, it, expect } from 'vitest';
import { computeSessionExpiry, isIdleExpired, isSessionValid } from './session-policy.js';
import { DEFAULT_SESSION_POLICY } from '@eam/shared';

describe('session policy', () => {
  it('computes absolute expiry from policy', () => {
    const now = new Date('2026-01-01T00:00:00Z');
    const exp = computeSessionExpiry(DEFAULT_SESSION_POLICY, now);
    expect(exp.getTime()).toBe(now.getTime() + 7 * 24 * 60 * 60 * 1000);
  });

  it('detects idle expiry', () => {
    const now = new Date('2026-01-01T01:00:00Z');
    const session = {
      expiresAt: new Date('2026-01-10T00:00:00Z'),
      lastActivityAt: new Date('2026-01-01T00:00:00Z'),
      revokedAt: null,
      createdAt: new Date('2026-01-01T00:00:00Z'),
    };
    expect(isIdleExpired(session, DEFAULT_SESSION_POLICY, now)).toBe(true);
  });

  it('validates active session', () => {
    const now = new Date('2026-01-01T00:10:00Z');
    const session = {
      expiresAt: new Date('2026-01-10T00:00:00Z'),
      lastActivityAt: new Date('2026-01-01T00:00:00Z'),
      revokedAt: null,
      createdAt: new Date('2026-01-01T00:00:00Z'),
    };
    expect(isSessionValid(session, DEFAULT_SESSION_POLICY, now)).toBe(true);
  });
});
