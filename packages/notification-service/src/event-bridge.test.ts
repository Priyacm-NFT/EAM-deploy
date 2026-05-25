import { describe, it, expect } from 'vitest';
import type { SystemEventMessage } from './event-bridge.js';
import { SYSTEM_EVENT_CHANNEL } from './event-bridge.js';
import { SYSTEM_EVENT_TYPES } from './events.js';

describe('event bridge', () => {
  it('uses a stable redis channel name', () => {
    expect(SYSTEM_EVENT_CHANNEL).toBe('eam:system-events');
  });

  it('serializes system events for pub/sub', () => {
    const message: SystemEventMessage = {
      eventType: 'WO_ASSIGNED',
      payload: { tenantId: 't1', wo_num: 'WO-1' },
    };
    const parsed = JSON.parse(JSON.stringify(message)) as SystemEventMessage;
    expect(parsed.eventType).toBe('WO_ASSIGNED');
    expect(parsed.payload.tenantId).toBe('t1');
  });

  it('includes workflow and work order event types', () => {
    expect(SYSTEM_EVENT_TYPES).toContain('WO_ASSIGNED');
    expect(SYSTEM_EVENT_TYPES).toContain('WF_TASK_ASSIGNED');
    expect(SYSTEM_EVENT_TYPES).toContain('WF_NOTIFICATION');
  });
});
