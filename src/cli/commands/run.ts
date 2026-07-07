import type { EngineDeps } from "../../engine/runner";
import { startRun } from "../../engine/runner";
import { loadWorkflowFile } from "../../schema/parse";
import { formatRunStatus } from "./format";

export async function runCommand(
  deps: EngineDeps,
  args: { file: string; inputs: Record<string, string> },
): Promise<string> {
  const source = await Bun.file(args.file).text();
  const { workflow, warnings } = await loadWorkflowFile(args.file);
  for (const w of warnings) deps.logger?.(`警告：${w}`);
  const run = await startRun(deps, workflow, args.inputs, source);
  return formatRunStatus(deps, run);
}
