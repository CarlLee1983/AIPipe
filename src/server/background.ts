import { executeFrom, type EngineDeps, type ResumePrep, type RunObserver } from "../engine/runner";
import type { Run } from "../store/runs";
import type { Workflow } from "../schema/workflow";
import type { EventBus } from "./events/bus";

export function createObserverForBus(
  runId: string,
  workflowName: string,
  bus: EventBus,
): RunObserver {
  return {
    onStageStart: (e) =>
      bus.emit({
        type: "stage:start",
        timestamp: Date.now(),
        data: { runId, stageId: e.stageId, name: e.name, index: e.index, prompt: e.prompt },
      }),
    onStageDone: (e) =>
      bus.emit({
        type: "stage:done",
        timestamp: Date.now(),
        data: { runId, stageId: e.stageId, output: e.output },
      }),
    onCheckpoint: (e) =>
      bus.emit({
        type: "run:checkpoint",
        timestamp: Date.now(),
        data: { runId, stageId: e.stageId, prompt: e.prompt, checkpointId: e.checkpointId },
      }),
    onRunDone: () =>
      bus.emit({
        type: "run:completed",
        timestamp: Date.now(),
        data: { runId },
      }),
    onRunFailed: (e) =>
      bus.emit({
        type: "run:failed",
        timestamp: Date.now(),
        data: { runId, stageId: e.stageId, error: e.error },
      }),
  };
}

export function startInBackground(
  deps: EngineDeps,
  bus: EventBus,
  run: Run,
  workflow: Workflow,
): void {
  bus.emit({
    type: "run:created",
    timestamp: Date.now(),
    data: { runId: run.id, workflowName: workflow.name },
  });

  const observer = createObserverForBus(run.id, workflow.name, bus);
  const depsWithObserver: EngineDeps = { ...deps, observer };

  // 刻意不 await，背景執行
  void executeFrom(depsWithObserver, run, workflow, run.currentStageIndex).catch((err) => {
    bus.emit({
      type: "run:failed",
      timestamp: Date.now(),
      data: {
        runId: run.id,
        stageId: "root",
        error: err instanceof Error ? err.message : String(err),
      },
    });
  });
}

export function resumeInBackground(
  deps: EngineDeps,
  bus: EventBus,
  prep: ResumePrep,
): void {
  if (!prep.resume) {
    bus.emit({
      type: "run:rejected",
      timestamp: Date.now(),
      data: { runId: prep.run.id },
    });
    return;
  }

  const observer = createObserverForBus(prep.run.id, prep.run.workflowName, bus);
  const depsWithObserver: EngineDeps = { ...deps, observer };

  void executeFrom(depsWithObserver, prep.run, prep.workflow!, prep.fromIndex!).catch((err) => {
    bus.emit({
      type: "run:failed",
      timestamp: Date.now(),
      data: {
        runId: prep.run.id,
        stageId: "root",
        error: err instanceof Error ? err.message : String(err),
      },
    });
  });
}
