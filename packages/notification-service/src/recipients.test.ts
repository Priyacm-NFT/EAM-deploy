import { describe, it, expect } from 'vitest';
import { deduplicateRecipients } from './recipients.js';

describe('recipient deduplication', () => {
  it('removes duplicate user ids', () => {
    const out = deduplicateRecipients([
      { userId: 'a', email: 'a@x.com' },
      { userId: 'a', email: 'a@x.com' },
      { userId: 'b', email: 'b@x.com' },
    ]);
    expect(out).toHaveLength(2);
  });
});
