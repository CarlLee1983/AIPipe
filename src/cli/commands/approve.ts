import type { EngineDeps } from "../../engine/runner";
import { resumeRun } from "../../engine/runner";
import { formatRunStatus } from "./format";

export async function approveCommand(
  deps: EngineDeps,
  args: { runId: string; note?: string },
): Promise<string> {
  const run = await resumeRun(deps, args.runId, { approve: true, note: args.note });
  return formatRunStatus(deps, run);
}
