import { test, expect } from "bun:test";
import { openDb } from "../../src/store/db";
import { RunRepository } from "../../src/store/runs";
import { StepRepository } from "../../src/store/steps";
import { CheckpointRepository } from "../../src/store/checkpoints";
import { MockDriver } from "../../src/driver/mock";
import { createRun, prepareResume, executeFrom, type EngineDeps } from "../../src/engine/runner";
import type { Workflow } from "../../src/schema/workflow";

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

function deps(driver: MockDriver): EngineDeps {
  const db = openDb(":memory:");
  return { runs: new RunRepository(db), steps: new StepRepository(db), checkpoints: new CheckpointRepository(db), driver };
}

const reqWf = { name: "r", inputs: [{ name: "topic", required: true }], stages: [{ id: "a", agent: { prompt: "{{topic}}" } }] } as unknown as Workflow;

test("createRun 只建立 pending run 不執行", () => {
  const d = deps(new MockDriver([]));
  const run = createRun(d, wf, {}, yaml);
  expect(run.status).toBe("pending");
  expect(run.currentStageIndex).toBe(0);
  expect(d.steps.listByRun(run.id)).toHaveLength(0);
});

test("createRun 缺 required input 擲錯", () => {
  const d = deps(new MockDriver([]));
  expect(() => createRun(d, reqWf, {}, "x")).toThrow(/topic/);
});

test("prepareResume approve 回 resume:true 並帶 fromIndex", async () => {
  const d = deps(new MockDriver([{ output: "草稿內容" }]));
  const run = createRun(d, wf, {}, yaml);
  await executeFrom(d, run, wf, 0); // 跑到 checkpoint → paused
  const prep = prepareResume(d, run.id, { approve: true, note: "讚" });
  expect(prep.resume).toBe(true);
  expect(prep.fromIndex).toBe(1);
  expect(prep.workflow!.name).toBe("demo");
  expect(d.checkpoints.listByRun(run.id)[0].decision).toBe("approved");
  expect(d.checkpoints.listByRun(run.id)[0].note).toBe("讚");
});

test("prepareResume reject 標 rejected 回 resume:false", async () => {
  const d = deps(new MockDriver([{ output: "草稿內容" }]));
  const run = createRun(d, wf, {}, yaml);
  await executeFrom(d, run, wf, 0);
  const prep = prepareResume(d, run.id, { approve: false });
  expect(prep.resume).toBe(false);
  expect(prep.run.status).toBe("rejected");
});

test("prepareResume 找不到 run 擲錯", () => {
  expect(() => prepareResume(deps(new MockDriver([])), "nope", { approve: true })).toThrow(/找不到/);
});

test("prepareResume 非 paused 擲錯", () => {
  const d = deps(new MockDriver([]));
  const run = createRun(d, wf, {}, yaml); // pending
  expect(() => prepareResume(d, run.id, { approve: true })).toThrow(/paused/);
});
