type EventHandler = (payload: unknown) => void | Promise<void>;

export class EventBus {
  private handlers = new Map<string, Set<EventHandler>>();

  on(event: string, handler: EventHandler): () => void {
    if (!this.handlers.has(event)) {
      this.handlers.set(event, new Set());
    }
    this.handlers.get(event)!.add(handler);
    return () => this.handlers.get(event)?.delete(handler);
  }

  async emit(event: string, payload: unknown): Promise<void> {
    const handlers = this.handlers.get(event);
    if (!handlers) return;
    await Promise.all([...handlers].map((h) => h(payload)));
  }
}

export const globalEventBus = new EventBus();
