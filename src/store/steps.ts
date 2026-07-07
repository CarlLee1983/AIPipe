import type { Database } from "bun:sqlite";

export type StepStatus = "running" | "completed" | "failed";

export interface StepRecord {
  id: string;
  runId: string;
  stageId: string;
  prompt: string;
  output: string | null;
  status: StepStatus;
  error: string | null;
  startedAt: string;
  endedAt: string | null;
}

interface StepRow {
  id: string;
  run_id: string;
  stage_id: string;
  prompt: string;
  output: string | null;
  status: string;
  error: string | null;
  started_at: string;
  ended_at: string | null;
}

function toStep(row: StepRow): StepRecord {
  return {
    id: row.id,
    runId: row.run_id,
    stageId: row.stage_id,
    prompt: row.prompt,
    output: row.output,
    status: row.status as StepStatus,
    error: row.error,
    startedAt: row.started_at,
    endedAt: row.ended_at,
  };
}

export class StepRepository {
  constructor(private db: Database) {}

  create(input: { runId: string; stageId: string; prompt: string }): StepRecord {
    const id = crypto.randomUUID();
    this.db
      .query(
        `INSERT INTO steps (id, run_id, stage_id, prompt, output, status, error, started_at, ended_at)
         VALUES ($id, $runId, $stageId, $prompt, NULL, 'running', NULL, $started, NULL)`,
      )
      .run({ id, runId: input.runId, stageId: input.stageId, prompt: input.prompt, started: new Date().toISOString() });
    return this.getById(id)!;
  }

  complete(id: string, output: string): void {
    this.db
      .query("UPDATE steps SET status = 'completed', output = $output, ended_at = $now WHERE id = $id")
      .run({ id, output, now: new Date().toISOString() });
  }

  fail(id: string, error: string): void {
    this.db
      .query("UPDATE steps SET status = 'failed', error = $error, ended_at = $now WHERE id = $id")
      .run({ id, error, now: new Date().toISOString() });
  }

  listByRun(runId: string): StepRecord[] {
    const rows = this.db
      .query("SELECT * FROM steps WHERE run_id = $runId ORDER BY started_at ASC")
      .all({ runId }) as StepRow[];
    return rows.map(toStep);
  }

  private getById(id: string): StepRecord | null {
    const row = this.db.query("SELECT * FROM steps WHERE id = $id").get({ id }) as StepRow | null;
    return row ? toStep(row) : null;
  }
}
