import { test, expect } from "bun:test";
import { openDb } from "../../src/store/db";
import { RunRepository } from "../../src/store/runs";
import { StepRepository } from "../../src/store/steps";
import { CheckpointRepository } from "../../src/store/checkpoints";
import { MockDriver } from "../../src/driver/mock";
import { startRun, type EngineDeps, type RunObserver } from "../../src/engine/runner";
import type { Workflow } from "../../src/schema/workflow";

function recorderObserver(): { observer: RunObserver; events: string[] } {
  const events: string[] = [];
  const observer: RunObserver = {
    onStageStart: (e) => events.push(`start:${e.stageId}:${e.index}`),
    onStageDone: (e) => events.push(`done:${e.stageId}:${e.output}`),
    onCheckpoint: (e) => events.push(`cp:${e.stageId}`),
    onRunDone: () => events.push("run:done"),
    onRunFailed: (e) => events.push(`run:failed:${e.stageId}`),
  };
  return { observer, events };
}

const yaml = `
name: demo
inputs: []
stages:
  - id: draft
    agent: { prompt: "寫草稿" }
    output: draft
    checkpoint: { prompt: "OK 嗎？" }
  - id: publish
    agent: { prompt: "發佈 {{draft}}" }
    output: final
`;
const wf = {
  name: "demo",
  inputs: [],
  stages: [
    { id: "draft", agent: { prompt: "寫草稿" }, output: "draft", checkpoint: { prompt: "OK 嗎？" } },
    { id: "publish", agent: { prompt: "發佈 {{draft}}" }, output: "final" },
  ],
} as unknown as Workflow;

function deps(driver: MockDriver, observer?: RunObserver): EngineDeps {
  const db = openDb(":memory:");
  return { runs: new RunRepository(db), steps: new StepRepository(db), checkpoints: new CheckpointRepository(db), driver, observer };
}

test("observer 依序收到 stage 事件並在 checkpoint 停止", async () => {
  const { observer, events } = recorderObserver();
  const run = await startRun(deps(new MockDriver([{ output: "草稿內容" }]), observer), wf, {}, yaml);
  expect(run.status).toBe("paused");
  expect(events).toEqual(["start:draft:0", "done:draft:草稿內容", "cp:draft"]);
});

test("driver 失敗時 observer 收到 onRunFailed", async () => {
  const { observer, events } = recorderObserver();
  const failWf = { name: "d", inputs: [], stages: [{ id: "a", agent: { prompt: "x" } }] } as unknown as Workflow;
  await startRun(deps(new MockDriver([{ output: "", success: false }]), observer), failWf, {}, "name: d\ninputs: []\nstages:\n  - id: a\n    agent: { prompt: x }");
  expect(events[0]).toBe("start:a:0");
  expect(events.some((e) => e.startsWith("run:failed:a"))).toBe(true);
});

test("不傳 observer 行為不變（一路跑完）", async () => {
  const okWf = { name: "d", inputs: [], stages: [{ id: "a", agent: { prompt: "x" }, output: "o" }] } as unknown as Workflow;
  const run = await startRun(deps(new MockDriver([{ output: "結果" }])), okWf, {}, "name: d\ninputs: []\nstages:\n  - id: a\n    agent: { prompt: x }\n    output: o");
  expect(run.status).toBe("completed");
});
