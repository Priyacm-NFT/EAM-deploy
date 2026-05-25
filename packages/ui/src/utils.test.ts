import { describe, it, expect } from 'vitest';
import { cn } from './lib/utils.js';

describe('cn', () => {
  it('merges classes', () => {
    expect(cn('a', 'b')).toContain('a');
  });
});
