import { describe, it, expect } from 'vitest';
import { scanBuffer, EICAR_TEST_STRING } from './scan.js';

describe('virus scan', () => {
  it('detects EICAR', async () => {
    const r = await scanBuffer(Buffer.from(EICAR_TEST_STRING));
    expect(r.status).toBe('INFECTED');
  });

  it('marks clean file', async () => {
    const r = await scanBuffer(Buffer.from('hello'));
    expect(r.status).toBe('CLEAN');
  });
});
