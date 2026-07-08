export type RunStatus = "pending" | "running" | "paused" | "completed" | "rejected" | "failed";

export interface Run {
  id: string;
  workflowName: string;
  status: RunStatus;
  inputs: Record<string, string>;
  context: Record<string, string>;
  currentStageIndex: number;
  createdAt: string;
  updatedAt: string;
}

export interface StepRecord {
  id: string;
  runId: string;
  stageId: string;
  prompt?: string;
  input?: string;
  output: string | null;
  status: "running" | "completed" | "failed" | "pending";
  error: string | null;
  startedAt: string;
  endedAt: string | null;
}

export interface CheckpointRecord {
  id: string;
  runId: string;
  stageId: string;
  prompt: string;
  decision: "pending" | "approved" | "rejected";
  note: string | null;
  decidedAt: string | null;
}

export interface WorkflowSummary {
  name: string;
  description?: string;
  inputs: { name: string; required: boolean; default?: string }[];
  file?: string;
  stageCount?: number;
}

export interface RunDetail {
  run: Run;
  steps: StepRecord[];
  checkpoints: CheckpointRecord[];
}
