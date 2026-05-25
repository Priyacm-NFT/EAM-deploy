import { describe, it, expect } from 'vitest';
import { compareWorkflowVersions, pickWorkflowDefinition } from './version.js';

describe('workflow version pinning', () => {
  const defs = [
    { id: 'v1', triggerEvent: 'CREATE', isActive: 'true', version: '1' },
    { id: 'v2', triggerEvent: 'CREATE', isActive: 'true', version: '2' },
    { id: 'old', triggerEvent: 'CREATE', isActive: 'false', version: '3' },
  ];

  it('picks highest active version for new instances', () => {
    expect(pickWorkflowDefinition(defs, 'CREATE')?.id).toBe('v2');
  });

  it('pins in-flight instances to a specific definition id', () => {
    expect(pickWorkflowDefinition(defs, 'CREATE', { workflowDefId: 'v1' })?.id).toBe('v1');
  });

  it('returns null when pinned id is unknown', () => {
    expect(pickWorkflowDefinition(defs, 'CREATE', { workflowDefId: 'missing' })).toBeNull();
  });

  it('compares dotted versions numerically', () => {
    expect(compareWorkflowVersions('2.1', '2.0.9')).toBeGreaterThan(0);
    expect(compareWorkflowVersions('10', '9')).toBeGreaterThan(0);
  });
});
