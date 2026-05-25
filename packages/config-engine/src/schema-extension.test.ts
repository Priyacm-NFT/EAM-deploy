import { describe, it, expect } from 'vitest';
import { sanitizeColumnName } from './schema-extension.js';

describe('SchemaExtensionService', () => {
  it('prefixes custom column names', () => {
    expect(sanitizeColumnName('asset_tag')).toBe('custom__asset_tag');
    expect(sanitizeColumnName('custom__x')).toBe('custom__x');
  });

  it('strips unsafe characters from column names', () => {
    expect(sanitizeColumnName('bad-key!')).toBe('custom__badkey');
  });
});
