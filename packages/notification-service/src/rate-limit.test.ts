import { describe, it, expect, beforeEach } from 'vitest';
import {
  parseRateLimitConfig,
  checkInMemoryRateLimit,
  resetInMemoryRateLimits,
} from './rate-limit.js';

describe('rate limiting', () => {
  beforeEach(() => {
    resetInMemoryRateLimits();
  });

  it('parses rate limit config with digest overflow', () => {
    expect(
      parseRateLimitConfig({ max: 10, windowSeconds: 60, overflowMode: 'digest' }),
    ).toEqual({
      max: 10,
      windowSeconds: 60,
      overflowMode: 'digest',
    });
  });

  it('blocks after max events in the window', () => {
    const key = 'tenant:trigger';
    for (let i = 0; i < 10; i++) {
      expect(checkInMemoryRateLimit(key, 10, 60).allowed).toBe(true);
    }
    const blocked = checkInMemoryRateLimit(key, 10, 60);
    expect(blocked.allowed).toBe(false);
    expect(blocked.count).toBe(11);
  });
});
