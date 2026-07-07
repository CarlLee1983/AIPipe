import type { Workflow } from "../schema/workflow";
import { interpolate, resolveInputs, withOutput, type Context } from "./context";
import type { AgentDriver } from "../driver/types";
import type { RunRepository, Run } from "../store/runs";
import type { StepRepository } from "../store/steps";
import type { CheckpointRepository } from "../store/checkpoints";
import { loadWorkflowFromString } from "../schema/parse";

export interface EngineDeps {
  runs: RunRepository;
  steps: StepRepository;
  checkpoints: CheckpointRepository;
  driver: AgentDriver;
  logger?: (msg: string) => void;
}

export async function executeFrom(
  deps: EngineDeps,
  run: Run,
  workflow: Workflow,
  fromIndex: number,
): Promise<Run> {
  let context: Context = run.context;
  deps.runs.updateStatus(run.id, "running");

  for (let i = fromIndex; i < workflow.stages.length; i++) {
    const stage = workflow.stages[i];
    const { text: prompt, missing } = interpolate(stage.agent.prompt, context);
    for (const name of missing) {
      deps.logger?.(`run ${run.id}：stage "${stage.id}" 未定義變數 {{${name}}}，以空字串代入`);
    }

    const step = deps.steps.create({ runId: run.id, stageId: stage.id, prompt });
    const result = await deps.driver.run({
      prompt,
      allowedTools: stage.agent.allowedTools,
      model: stage.agent.model,
      cwd: stage.agent.cwd,
    });

    if (!result.success) {
      deps.steps.fail(step.id, `driver 回報失敗：${JSON.stringify(result.raw)}`);
      deps.runs.updateStatus(run.id, "failed");
      return deps.runs.get(run.id)!;
    }

    deps.steps.complete(step.id, result.output);
    if (stage.output) {
      context = withOutput(context, stage.output, result.output);
      deps.runs.updateContext(run.id, context);
    }

    if (stage.checkpoint) {
      deps.checkpoints.create({ runId: run.id, stageId: stage.id, prompt: stage.checkpoint.prompt });
      deps.runs.updateStageIndex(run.id, i + 1);
      deps.runs.updateStatus(run.id, "paused");
      return deps.runs.get(run.id)!;
    }

    deps.runs.updateStageIndex(run.id, i + 1);
  }

  deps.runs.updateStatus(run.id, "completed");
  return deps.runs.get(run.id)!;
}

export async function startRun(
  deps: EngineDeps,
  workflow: Workflow,
  inputs: Record<string, string>,
  source: string,
): Promise<Run> {
  const context = resolveInputs(workflow, inputs); // 缺 required 在此擲錯
  const run = deps.runs.create({
    workflowName: workflow.name,
    workflowSnapshot: source,
    inputs: context,
    context,
    status: "pending",
    currentStageIndex: 0,
  });
  return executeFrom(deps, run, workflow, 0);
}

export async function resumeRun(
  deps: EngineDeps,
  runId: string,
  decision: { approve: boolean; note?: string },
): Promise<Run> {
  const run = deps.runs.get(runId);
  if (!run) throw new Error(`找不到 run：${runId}`);
  if (run.status !== "paused") {
    throw new Error(`run ${runId} 狀態為 ${run.status}，非 paused，無法核可/駁回`);
  }
  const pending = deps.checkpoints.getPendingByRun(runId);
  if (!pending) throw new Error(`run ${runId} 沒有待決的 checkpoint`);

  if (!decision.approve) {
    deps.checkpoints.decide(pending.id, "rejected", decision.note);
    deps.runs.updateStatus(runId, "rejected");
    return deps.runs.get(runId)!;
  }

  deps.checkpoints.decide(pending.id, "approved", decision.note);
  const { workflow } = loadWorkflowFromString(run.workflowSnapshot);
  return executeFrom(deps, run, workflow, run.currentStageIndex);
}
