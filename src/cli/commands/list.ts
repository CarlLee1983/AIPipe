import type { EngineDeps } from "../../engine/runner";

export function listCommand(deps: EngineDeps): string {
  const runs = deps.runs.list();
  if (runs.length === 0) return "（尚無任何 run）";
  return runs
    .map((r) => `${r.id}\t${r.status}\t${r.workflowName}\t${r.updatedAt}`)
    .join("\n");
}
