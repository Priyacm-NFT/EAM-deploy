import { describe, it, expect } from 'vitest';
import { CLOSED_SR_STATUSES, CLOSED_WO_STATUSES } from './dashboard-data.js';

describe('dashboard-data', () => {
  it('defines terminal SR statuses', () => {
    expect(CLOSED_SR_STATUSES).toContain('CLOSED');
    expect(CLOSED_SR_STATUSES).toContain('CANCELLED');
  });

  it('defines terminal WO statuses', () => {
    expect(CLOSED_WO_STATUSES).toContain('CLOSED');
    expect(CLOSED_WO_STATUSES).toContain('COMPLETED');
  });
});
