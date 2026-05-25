import { describe, it, expect } from 'vitest';
import { hasPermission } from './permissions.js';

describe('hasPermission', () => {
  it('returns true when permission present', () => {
    expect(hasPermission(['admin:users:manage'], 'admin:users:manage')).toBe(true);
  });

  it('returns false when missing', () => {
    expect(hasPermission(['admin:users:manage'], 'admin:config:manage')).toBe(false);
  });
});
