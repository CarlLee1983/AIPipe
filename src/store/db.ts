import { Database } from "bun:sqlite";

export function migrate(db: Database): void {
  db.run(`
    CREATE TABLE IF NOT EXISTS runs (
      id TEXT PRIMARY KEY,
      workflow_name TEXT NOT NULL,
      workflow_snapshot TEXT NOT NULL,
      status TEXT NOT NULL,
      inputs TEXT NOT NULL,
      context TEXT NOT NULL,
      current_stage_index INTEGER NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
  `);
  db.run(`
    CREATE TABLE IF NOT EXISTS steps (
      id TEXT PRIMARY KEY,
      run_id TEXT NOT NULL REFERENCES runs(id),
      stage_id TEXT NOT NULL,
      prompt TEXT NOT NULL,
      output TEXT,
      status TEXT NOT NULL,
      error TEXT,
      started_at TEXT NOT NULL,
      ended_at TEXT
    );
  `);
  db.run(`
    CREATE TABLE IF NOT EXISTS checkpoints (
      id TEXT PRIMARY KEY,
      run_id TEXT NOT NULL REFERENCES runs(id),
      stage_id TEXT NOT NULL,
      prompt TEXT NOT NULL,
      decision TEXT NOT NULL,
      note TEXT,
      decided_at TEXT
    );
  `);
}

export function openDb(path: string): Database {
  const db = new Database(path, { strict: true });
  db.run("PRAGMA foreign_keys = ON;");
  migrate(db);
  return db;
}
