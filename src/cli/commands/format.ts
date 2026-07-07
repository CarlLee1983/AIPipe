import type { EngineDeps } from "../../engine/runner";
import type { Run } from "../../store/runs";

export function formatRunStatus(deps: EngineDeps, run: Run): string {
  const lines = [`Run ${run.id}`, `工作流：${run.workflowName}`, `狀態：${run.status}`];
  if (run.status === "paused") {
    const pending = deps.checkpoints.getPendingByRun(run.id);
    if (pending) {
      lines.push(`檢查點（stage ${pending.stageId}）：${pending.prompt}`);
      lines.push(`核可請執行：aipipe approve ${run.id}`);
      lines.push(`駁回請執行：aipipe reject ${run.id}`);
    }
  }
  return lines.join("\n");
}
