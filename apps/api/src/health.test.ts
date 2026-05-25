import { describe, it, expect } from 'vitest';
import { getAlgorithm } from '@eam/auth';

describe('api security', () => {
  it('uses RS256', () => {
    expect(getAlgorithm()).toBe('RS256');
  });
});
