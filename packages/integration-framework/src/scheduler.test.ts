import { describe, it, expect } from 'vitest';
import { computeNextRun } from './scheduler.js';

describe('computeNextRun', () => {
  it('returns a future date for a valid cron', () => {
    const from = new Date('2026-05-25T10:00:00Z');
    const next = computeNextRun('0 * * * *', from);
    expect(next.getTime()).toBeGreaterThan(from.getTime());
  });
});
