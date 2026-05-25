type EventHandler = (payload: unknown) => void | Promise<void>;
type AnyEventHandler = (event: string, payload: unknown) => void | Promise<void>;

export class EventBus {
  private handlers = new Map<string, Set<EventHandler>>();
  private anyHandlers = new Set<AnyEventHandler>();

  onAny(handler: AnyEventHandler): () => void {
    this.anyHandlers.add(handler);
    return () => this.anyHandlers.delete(handler);
  }

  on(event: string, handler: EventHandler): () => void {
    if (!this.handlers.has(event)) {
      this.handlers.set(event, new Set());
    }
    this.handlers.get(event)!.add(handler);
    return () => this.handlers.get(event)?.delete(handler);
  }

  async emit(event: string, payload: unknown): Promise<void> {
    const handlers = this.handlers.get(event);
    const runs: Promise<void>[] = [];
    if (handlers) {
      runs.push(...[...handlers].map(async (h) => {
        await h(payload);
      }));
    }
    runs.push(
      ...[...this.anyHandlers].map(async (h) => {
        await h(event, payload);
      }),
    );
    await Promise.all(runs);
  }
}

export const globalEventBus = new EventBus();
