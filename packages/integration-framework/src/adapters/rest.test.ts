import { describe, it, expect } from 'vitest';
import { RestAdapter } from './rest.js';

describe('RestAdapter', () => {
  it('requires url for test', async () => {
    const adapter = new RestAdapter();
    const r = await adapter.test({});
    expect(r.success).toBe(false);
  });
});
