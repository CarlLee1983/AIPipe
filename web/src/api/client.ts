import type { Run, RunDetail, WorkflowSummary } from "./types";

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`/api${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
  });
  const json = await res.json();
  if (json && typeof json === "object" && "success" in json) {
    if (!json.success) throw new Error(json.error ?? `請求失敗（${res.status}）`);
    return json.data as T;
  }
  if (!res.ok) throw new Error(json?.error ?? `請求失敗（${res.status}）`);
  return json as T;
}

export const api = {
  listWorkflows: () => call<WorkflowSummary[]>("/workflows"),
  listRuns: () => call<Run[]>("/runs"),
  getRun: (id: string) => call<RunDetail>(`/runs/${encodeURIComponent(id)}`),
  createRun: (workflow: string, inputs: Record<string, string>) =>
    call<{ runId: string; status: string }>("/runs", {
      method: "POST",
      body: JSON.stringify({ workflow, inputs }),
    }),
  approve: (id: string, note?: string) =>
    call<Run | { runId: string; status: string }>(`/runs/${encodeURIComponent(id)}/approve`, {
      method: "POST",
      body: JSON.stringify({ note }),
    }),
  reject: (id: string, note?: string) =>
    call<Run | { runId: string; status: string }>(`/runs/${encodeURIComponent(id)}/reject`, {
      method: "POST",
      body: JSON.stringify({ note }),
    }),
};
