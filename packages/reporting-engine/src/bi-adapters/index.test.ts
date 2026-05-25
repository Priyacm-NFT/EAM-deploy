import { describe, it, expect } from 'vitest';
import { getBiAdapter, supportedBiAdapterTypes } from './index.js';

describe('BI adapter registry', () => {
  it('lists all PRD adapter types', () => {
    const types = supportedBiAdapterTypes();
    expect(types).toContain('POWERBI');
    expect(types).toContain('QLIK');
    expect(types).toContain('TABLEAU');
    expect(types).toContain('COGNOS');
    expect(types).toContain('BIRT');
  });

  it('returns adapter by type', () => {
    expect(getBiAdapter('COGNOS')?.type).toBe('COGNOS');
  });
});
