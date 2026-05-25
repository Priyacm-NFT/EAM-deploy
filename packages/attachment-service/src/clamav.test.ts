import { describe, it, expect } from 'vitest';
import { parseClamavResponse } from './clamav.js';

describe('parseClamavResponse', () => {
  it('detects infection', () => {
    const r = parseClamavResponse('stream: Eicar-Signature FOUND\n');
    expect(r.status).toBe('INFECTED');
    expect(r.signature).toBe('Eicar-Signature');
  });

  it('detects clean file', () => {
    const r = parseClamavResponse('stream: OK\n');
    expect(r.status).toBe('CLEAN');
  });

  it('marks unknown response as failed', () => {
    const r = parseClamavResponse('stream: ERROR\n');
    expect(r.status).toBe('FAILED');
  });
});
