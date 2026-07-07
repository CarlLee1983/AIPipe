import { openDb } from "../store/db";
import { RunRepository } from "../store/runs";
import { StepRepository } from "../store/steps";
import { CheckpointRepository } from "../store/checkpoints";
import { ClaudeCodeDriver } from "../driver/claude-code";
import type { AgentDriver } from "../driver/types";
import type { EngineDeps } from "../engine/runner";

export function buildDeps(
  opts: { dbPath?: string; driver?: AgentDriver } = {},
): EngineDeps & { dbPath: string } {
  const dbPath = opts.dbPath ?? process.env.AIPIPE_DB ?? "./aipipe.sqlite";
  const db = openDb(dbPath);
  return {
    dbPath,
    runs: new RunRepository(db),
    steps: new StepRepository(db),
    checkpoints: new CheckpointRepository(db),
    driver: opts.driver ?? new ClaudeCodeDriver(),
    logger: (msg: string) => console.error(msg),
  };
}
