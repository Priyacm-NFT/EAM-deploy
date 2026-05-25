import { describe, it, expect } from 'vitest';
import {
  parseDigestConfig,
  buildDigestEmail,
  digestFlushAfter,
} from './digest.js';

describe('digest', () => {
  it('parses enabled digest config', () => {
    expect(parseDigestConfig({ enabled: true, windowMinutes: 5 })).toEqual({
      enabled: true,
      windowMinutes: 5,
    });
    expect(parseDigestConfig({ enabled: false })).toBeNull();
  });

  it('builds a combined digest email', () => {
    const email = buildDigestEmail([
      { subject: 'WO-1', html: '<p>One</p>' },
      { subject: 'WO-2', html: '<p>Two</p>' },
    ]);
    expect(email.subject).toContain('2 notification');
    expect(email.html).toContain('WO-1');
    expect(email.html).toContain('WO-2');
  });

  it('schedules flush after the configured window', () => {
    const before = Date.now();
    const flushAt = digestFlushAfter(5);
    expect(flushAt.getTime()).toBeGreaterThanOrEqual(before + 5 * 60_000 - 1000);
  });
});
