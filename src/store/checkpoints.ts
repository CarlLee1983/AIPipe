import type { Database } from "bun:sqlite";

export type Decision = "pending" | "approved" | "rejected";

export interface CheckpointRecord {
  id: string;
  runId: string;
  stageId: string;
  prompt: string;
  decision: Decision;
  note: string | null;
  decidedAt: string | null;
}

interface CheckpointRow {
  id: string;
  run_id: string;
  stage_id: string;
  prompt: string;
  decision: string;
  note: string | null;
  decided_at: string | null;
}

function toCheckpoint(row: CheckpointRow): CheckpointRecord {
  return {
    id: row.id,
    runId: row.run_id,
    stageId: row.stage_id,
    prompt: row.prompt,
    decision: row.decision as Decision,
    note: row.note,
    decidedAt: row.decided_at,
  };
}

export class CheckpointRepository {
  constructor(private db: Database) {}

  create(input: { runId: string; stageId: string; prompt: string }): CheckpointRecord {
    const id = crypto.randomUUID();
    this.db
      .query(
        `INSERT INTO checkpoints (id, run_id, stage_id, prompt, decision, note, decided_at)
         VALUES ($id, $runId, $stageId, $prompt, 'pending', NULL, NULL)`,
      )
      .run({ id, runId: input.runId, stageId: input.stageId, prompt: input.prompt });
    return this.getById(id)!;
  }

  decide(id: string, decision: "approved" | "rejected", note?: string): void {
    this.db
      .query("UPDATE checkpoints SET decision = $decision, note = $note, decided_at = $now WHERE id = $id")
      .run({ id, decision, note: note ?? null, now: new Date().toISOString() });
  }

  getPendingByRun(runId: string): CheckpointRecord | null {
    const row = this.db
      .query(
        "SELECT * FROM checkpoints WHERE run_id = $runId AND decision = 'pending' ORDER BY rowid DESC LIMIT 1",
      )
      .get({ runId }) as CheckpointRow | null;
    return row ? toCheckpoint(row) : null;
  }

  getLatestByRun(runId: string): CheckpointRecord | null {
    const row = this.db
      .query("SELECT * FROM checkpoints WHERE run_id = $runId ORDER BY rowid DESC LIMIT 1")
      .get({ runId }) as CheckpointRow | null;
    return row ? toCheckpoint(row) : null;
  }

  listByRun(runId: string): CheckpointRecord[] {
    const rows = this.db
      .query("SELECT * FROM checkpoints WHERE run_id = $runId ORDER BY rowid ASC")
      .all({ runId }) as CheckpointRow[];
    return rows.map(toCheckpoint);
  }

  private getById(id: string): CheckpointRecord | null {
    const row = this.db.query("SELECT * FROM checkpoints WHERE id = $id").get({ id }) as CheckpointRow | null;
    return row ? toCheckpoint(row) : null;
  }
}
