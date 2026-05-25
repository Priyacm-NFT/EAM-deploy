import { describe, it, expect, vi } from 'vitest';
import { EventBus } from './event-bus.js';

describe('EventBus', () => {
  it('emits to registered handlers', async () => {
    const bus = new EventBus();
    const handler = vi.fn();
    bus.on('test', handler);
    await bus.emit('test', { id: 1 });
    expect(handler).toHaveBeenCalledWith({ id: 1 });
  });
});
