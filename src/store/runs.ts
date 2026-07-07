import type { Database } from "bun:sqlite";

export type RunStatus =
  | "pending"
  | "running"
  | "paused"
  | "completed"
  | "rejected"
  | "failed";

export interface Run {
  id: string;
  workflowName: string;
  workflowSnapshot: string;
  status: RunStatus;
  inputs: Record<string, string>;
  context: Record<string, string>;
  currentStageIndex: number;
  createdAt: string;
  updatedAt: string;
}

interface RunRow {
  id: string;
  workflow_name: string;
  workflow_snapshot: string;
  status: string;
  inputs: string;
  context: string;
  current_stage_index: number;
  created_at: string;
  updated_at: string;
}

function toRun(row: RunRow): Run {
  return {
    id: row.id,
    workflowName: row.workflow_name,
    workflowSnapshot: row.workflow_snapshot,
    status: row.status as RunStatus,
    inputs: JSON.parse(row.inputs),
    context: JSON.parse(row.context),
    currentStageIndex: row.current_stage_index,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export class RunRepository {
  constructor(private db: Database) {}

  create(input: {
    id?: string;
    workflowName: string;
    workflowSnapshot: string;
    inputs: Record<string, string>;
    context: Record<string, string>;
    status?: RunStatus;
    currentStageIndex?: number;
  }): Run {
    const now = new Date().toISOString();
    const id = input.id ?? crypto.randomUUID();
    this.db
      .query(
        `INSERT INTO runs
          (id, workflow_name, workflow_snapshot, status, inputs, context, current_stage_index, created_at, updated_at)
         VALUES ($id, $name, $snapshot, $status, $inputs, $context, $idx, $created, $updated)`,
      )
      .run({
        id,
        name: input.workflowName,
        snapshot: input.workflowSnapshot,
        status: input.status ?? "pending",
        inputs: JSON.stringify(input.inputs),
        context: JSON.stringify(input.context),
        idx: input.currentStageIndex ?? 0,
        created: now,
        updated: now,
      });
    return this.get(id)!;
  }

  get(id: string): Run | null {
    const row = this.db.query("SELECT * FROM runs WHERE id = $id").get({ id }) as RunRow | null;
    return row ? toRun(row) : null;
  }

  list(): Run[] {
    const rows = this.db.query("SELECT * FROM runs ORDER BY created_at DESC").all() as RunRow[];
    return rows.map(toRun);
  }

  updateStatus(id: string, status: RunStatus): void {
    this.db
      .query("UPDATE runs SET status = $status, updated_at = $now WHERE id = $id")
      .run({ id, status, now: new Date().toISOString() });
  }

  updateContext(id: string, context: Record<string, string>): void {
    this.db
      .query("UPDATE runs SET context = $context, updated_at = $now WHERE id = $id")
      .run({ id, context: JSON.stringify(context), now: new Date().toISOString() });
  }

  updateStageIndex(id: string, index: number): void {
    this.db
      .query("UPDATE runs SET current_stage_index = $idx, updated_at = $now WHERE id = $id")
      .run({ id, idx: index, now: new Date().toISOString() });
  }
}
