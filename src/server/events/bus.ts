export type ServerEvent =
  | { type: "run:created"; timestamp: number; data: { runId: string; workflowName: string } }
  | { type: "stage:start"; timestamp: number; data: { runId: string; stageId: string; name?: string; index: number; prompt: string } }
  | { type: "stage:done"; timestamp: number; data: { runId: string; stageId: string; output: string } }
  | { type: "run:checkpoint"; timestamp: number; data: { runId: string; stageId: string; prompt: string; checkpointId: string } }
  | { type: "run:completed"; timestamp: number; data: { runId: string } }
  | { type: "run:failed"; timestamp: number; data: { runId: string; stageId: string; error: string } }
  | { type: "run:rejected"; timestamp: number; data: { runId: string } };

type Listener = (event: ServerEvent) => void;

export class EventBus {
  private listeners = new Set<Listener>();

  emit(event: ServerEvent): void {
    for (const listener of this.listeners) {
      try {
        listener(event);
      } catch (err) {
        // 隔離 listener 錯誤，不影響其他訂閱者或發布者
      }
    }
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  subscribeRun(runId: string, listener: Listener): () => void {
    return this.subscribe((event) => {
      if (event.data && "runId" in event.data && event.data.runId === runId) {
        listener(event);
      }
    });
  }
}
