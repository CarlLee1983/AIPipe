import type { EngineDeps } from "../../engine/runner";

export function showCommand(deps: EngineDeps, args: { runId: string }): string {
  const run = deps.runs.get(args.runId);
  if (!run) return `找不到 run：${args.runId}`;
  const lines = [
    `Run ${run.id}`,
    `工作流：${run.workflowName}`,
    `狀態：${run.status}`,
    `目前階段索引：${run.currentStageIndex}`,
    `context：${JSON.stringify(run.context)}`,
    "",
    "步驟：",
  ];
  for (const s of deps.steps.listByRun(run.id)) {
    lines.push(`  [${s.status}] ${s.stageId}`);
    if (s.output) lines.push(`     output：${s.output}`);
    if (s.error) lines.push(`     error：${s.error}`);
  }
  const cps = deps.checkpoints.listByRun(run.id);
  if (cps.length) {
    lines.push("", "檢查點：");
    for (const c of cps) lines.push(`  [${c.decision}] ${c.stageId}：${c.prompt}`);
  }
  return lines.join("\n");
}
