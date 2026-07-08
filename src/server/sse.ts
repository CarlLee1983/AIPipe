import type { EngineDeps } from "../engine/runner";
import type { EventBus, ServerEvent } from "./events/bus";

export function formatSseFrame(event: ServerEvent): string {
  return `data: ${JSON.stringify(event)}\n\n`;
}

export function sseHandler(
  req: Request,
  bus: EventBus,
  deps: EngineDeps,
  runId: string,
): Response {
  const run = deps.runs.get(runId);
  if (!run) {
    return new Response(JSON.stringify({ error: `Run "${runId}" 不存在` }), {
      status: 404,
      headers: { "Content-Type": "application/json" },
    });
  }

  let unsubscribe: (() => void) | undefined;
  const encoder = new TextEncoder();

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const send = (event: ServerEvent) => {
        try {
          controller.enqueue(encoder.encode(formatSseFrame(event)));
        } catch {
          // 連線關閉時忽略寫入錯誤
        }
      };

      const sendBatch = (events: ServerEvent[]) => {
        if (events.length === 0) return;
        try {
          const payload = events.map((e) => formatSseFrame(e)).join("");
          controller.enqueue(encoder.encode(payload));
        } catch {
          // 連線關閉時忽略寫入錯誤
        }
      };

      // 1. 補發舊事件（History）
      const historyEvents: ServerEvent[] = [];
      historyEvents.push({
        type: "run:created",
        timestamp: Date.parse(run.createdAt),
        data: { runId: run.id, workflowName: run.workflowName },
      });

      const steps = deps.steps.listByRun(runId);
      steps.forEach((step, idx) => {
        historyEvents.push({
          type: "stage:start",
          timestamp: Date.parse(step.startedAt),
          data: { runId: run.id, stageId: step.stageId, index: idx, prompt: step.prompt },
        });

        if (step.status === "completed" && step.output !== null && step.endedAt !== null) {
          historyEvents.push({
            type: "stage:done",
            timestamp: Date.parse(step.endedAt),
            data: { runId: run.id, stageId: step.stageId, output: step.output },
          });
        } else if (step.status === "failed" && step.error !== null && step.endedAt !== null) {
          historyEvents.push({
            type: "run:failed",
            timestamp: Date.parse(step.endedAt),
            data: { runId: run.id, stageId: step.stageId, error: step.error },
          });
        }
      });

      if (run.status === "paused") {
        const cp = deps.checkpoints.getLatestByRun(runId);
        if (cp) {
          historyEvents.push({
            type: "run:checkpoint",
            timestamp: Date.parse(run.updatedAt),
            data: { runId: run.id, stageId: cp.stageId, prompt: cp.prompt, checkpointId: cp.id },
          });
        }
      } else if (run.status === "completed") {
        historyEvents.push({
          type: "run:completed",
          timestamp: Date.parse(run.updatedAt),
          data: { runId: run.id },
        });
      } else if (run.status === "failed") {
        const hasFailedStep = steps.some((s) => s.status === "failed");
        if (!hasFailedStep) {
          historyEvents.push({
            type: "run:failed",
            timestamp: Date.parse(run.updatedAt),
            data: { runId: run.id, stageId: "root", error: "Run failed without step error" },
          });
        }
      }

      sendBatch(historyEvents);

      // 2. 訂閱新事件
      unsubscribe = bus.subscribeRun(runId, (event) => {
        send(event);
      });

      // 3. 監聽連線中斷
      req.signal.addEventListener("abort", () => {
        if (unsubscribe) {
          unsubscribe();
          unsubscribe = undefined;
        }
        try {
          controller.close();
        } catch {
          // 忽略已關閉
        }
      });
    },
    cancel() {
      if (unsubscribe) {
        unsubscribe();
        unsubscribe = undefined;
      }
    },
  });

  return new Response(stream, {
    status: 200,
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      "Connection": "keep-alive",
    },
  });
}
