import type { ServerEvent } from "./events/bus";
import type { Run } from "../store/runs";
import type { StepRecord } from "../store/steps";
import type { CheckpointRecord } from "../store/checkpoints";
import type { WorkflowSummary } from "./workflows";

export type { WorkflowSummary };

export interface RunDetail {
  run: Run;
  steps: StepRecord[];
  checkpoints: CheckpointRecord[];
}

export interface ApiClient {
  createRun(workflow: string, inputs?: Record<string, string>): Promise<{ runId: string; status: string; workflow: string }>;
  listRuns(): Promise<Run[]>;
  getRun(runId: string): Promise<RunDetail>;
  resumeRun(runId: string, approve: boolean, note?: string): Promise<{ runId: string; status: string }>;
  subscribeEvents(runId: string, onEvent: (event: ServerEvent) => void, onError?: (err: Error) => void): () => void;
  listWorkflows(): Promise<WorkflowSummary[]>;
}

export function createClient(baseUrl: string): ApiClient {
  const url = (path: string) => `${baseUrl.replace(/\/$/, "")}${path}`;

  async function handleRes<T>(res: Response): Promise<T> {
    if (!res.ok) {
      const text = await res.text();
      let msg = text;
      try {
        const json = JSON.parse(text);
        if (json.error) msg = json.error;
      } catch {}
      throw new Error(`API Request Failed (${res.status}): ${msg}`);
    }
    return res.json() as Promise<T>;
  }

  return {
    async createRun(workflow, inputs = {}) {
      const res = await fetch(url("/api/runs"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workflow, inputs }),
      });
      return handleRes(res);
    },

    async listRuns() {
      const res = await fetch(url("/api/runs"));
      return handleRes(res);
    },

    async getRun(runId) {
      const res = await fetch(url(`/api/runs/${runId}`));
      return handleRes(res);
    },

    async resumeRun(runId, approve, note) {
      const res = await fetch(url(`/api/runs/${runId}/resume`), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ approve, note }),
      });
      return handleRes(res);
    },

    subscribeEvents(runId, onEvent, onError) {
      const controller = new AbortController();

      async function start() {
        try {
          const res = await fetch(url(`/api/runs/${runId}/events`), {
            signal: controller.signal,
          });
          if (!res.ok || !res.body) {
            throw new Error(`SSE connect failed: ${res.status}`);
          }
          const reader = res.body.getReader();
          const decoder = new TextDecoder();
          let buffer = "";

          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split("\n\n");
            buffer = lines.pop() ?? "";
            for (const chunk of lines) {
              const line = chunk.trim();
              if (line.startsWith("data: ")) {
                const jsonStr = line.slice(6);
                try {
                  const event = JSON.parse(jsonStr) as ServerEvent;
                  onEvent(event);
                } catch {
                  // 忽略 JSON 解析錯誤
                }
              }
            }
          }
        } catch (err) {
          if (controller.signal.aborted) return;
          onError?.(err instanceof Error ? err : new Error(String(err)));
        }
      }

      start();
      return () => controller.abort();
    },

    async listWorkflows() {
      const res = await fetch(url("/api/workflows"));
      return handleRes(res);
    },
  };
}
