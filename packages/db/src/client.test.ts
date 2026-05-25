import { describe, it, expect } from 'vitest';
import { slugify } from '@eam/shared';

describe('db package', () => {
  it('loads shared utilities', () => {
    expect(slugify('Hello World')).toBe('hello-world');
  });
});
