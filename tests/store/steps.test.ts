import { test, expect } from "bun:test";
import { openDb } from "../../src/store/db";
import { RunRepository } from "../../src/store/runs";
import { StepRepository } from "../../src/store/steps";

function setup() {
  const db = openDb(":memory:");
  const runs = new RunRepository(db);
  const run = runs.create({ workflowName: "d", workflowSnapshot: "x", inputs: {}, context: {} });
  return { steps: new StepRepository(db), runId: run.id };
}

test("create 建立 running step", () => {
  const { steps, runId } = setup();
  const step = steps.create({ runId, stageId: "s1", prompt: "hi" });
  expect(step.status).toBe("running");
  expect(step.startedAt).toBeString();
  expect(step.endedAt).toBeNull();
});

test("complete 標記完成並寫 output", () => {
  const { steps, runId } = setup();
  const step = steps.create({ runId, stageId: "s1", prompt: "hi" });
  steps.complete(step.id, "結果");
  const got = steps.listByRun(runId)[0];
  expect(got.status).toBe("completed");
  expect(got.output).toBe("結果");
  expect(got.endedAt).toBeString();
});

test("fail 標記失敗並寫 error", () => {
  const { steps, runId } = setup();
  const step = steps.create({ runId, stageId: "s1", prompt: "hi" });
  steps.fail(step.id, "炸了");
  const got = steps.listByRun(runId)[0];
  expect(got.status).toBe("failed");
  expect(got.error).toBe("炸了");
});

test("listByRun 依開始時間正序", () => {
  const { steps, runId } = setup();
  steps.create({ runId, stageId: "s1", prompt: "a" });
  steps.create({ runId, stageId: "s2", prompt: "b" });
  const list = steps.listByRun(runId);
  expect(list.map((s) => s.stageId)).toEqual(["s1", "s2"]);
});
