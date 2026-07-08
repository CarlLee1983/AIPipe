export type ServerEvent =
  | { type: "run:created"; timestamp: number; data: { runId: string; workflowName: string } }
  | { type: "stage:start"; timestamp: number; data: { runId: string; stageId: string; name?: string; index: number; prompt: string } }
  | { type: "stage:done"; timestamp: number; data: { runId: string; stageId: string; output: string } }
  | { type: "run:checkpoint"; timestamp: number; data: { runId: string; stageId: string; prompt: string; checkpointId: string } }
  | { type: "run:completed"; timestamp: number; data: { runId: string } }
  | { type: "run:failed"; timestamp: number; data: { runId: string; stageId: string; error: string } }
  | { type: "run:rejected"; timestamp: number; data: { runId: string } };

export interface RunEvent {
  type: string;
  data: unknown;
}

type Listener = (event: ServerEvent) => void;
type RunListener = (event: RunEvent) => void;

export class EventBus {
  private listeners = new Set<Listener>();
  private runListeners = new Map<string, Set<RunListener>>();

  emit(event: ServerEvent): void {
    for (const listener of this.listeners) {
      try {
        listener(event);
      } catch (err) {
        // 隔離 listener 錯誤，不影響其他訂閱者或發布者
      }
    }
    if (event.data && "runId" in event.data) {
      const set = this.runListeners.get(event.data.runId);
      if (set) {
        for (const listener of [...set]) {
          try {
            listener({ type: event.type, data: event.data });
          } catch {
            // 隔離 listener 錯誤，不影響其他訂閱者或發布者
          }
        }
      }
    }
  }

  subscribe(listener: Listener): () => void;
  subscribe(runId: string, listener: RunListener): () => void;
  subscribe(first: string | Listener, second?: RunListener): () => void {
    if (typeof first === "string") {
      let set = this.runListeners.get(first);
      if (!set) {
        set = new Set();
        this.runListeners.set(first, set);
      }
      set.add(second!);
      return () => {
        const current = this.runListeners.get(first);
        if (!current) return;
        current.delete(second!);
        if (current.size === 0) this.runListeners.delete(first);
      };
    }

    this.listeners.add(first);
    return () => {
      this.listeners.delete(first);
    };
  }

  subscribeRun(runId: string, listener: Listener): () => void {
    return this.subscribe((event) => {
      if (event.data && "runId" in event.data && event.data.runId === runId) {
        listener(event);
      }
    });
  }

  publish(runId: string, event: RunEvent): void {
    const data = event.data && typeof event.data === "object"
      ? { ...event.data, runId }
      : { value: event.data, runId };
    this.emit({ type: event.type as ServerEvent["type"], timestamp: Date.now(), data } as ServerEvent);
  }

  hasSubscribers(runId: string): boolean {
    return this.runListeners.has(runId);
  }
}
