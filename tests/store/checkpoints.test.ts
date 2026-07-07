import { test, expect } from "bun:test";
import { openDb } from "../../src/store/db";
import { RunRepository } from "../../src/store/runs";
import { CheckpointRepository } from "../../src/store/checkpoints";

function setup() {
  const db = openDb(":memory:");
  const run = new RunRepository(db).create({ workflowName: "d", workflowSnapshot: "x", inputs: {}, context: {} });
  return { cps: new CheckpointRepository(db), runId: run.id };
}

test("create 建立 pending checkpoint", () => {
  const { cps, runId } = setup();
  const cp = cps.create({ runId, stageId: "draft", prompt: "OK 嗎？" });
  expect(cp.decision).toBe("pending");
  expect(cp.decidedAt).toBeNull();
});

test("getPendingByRun 取得未決 checkpoint", () => {
  const { cps, runId } = setup();
  cps.create({ runId, stageId: "draft", prompt: "OK 嗎？" });
  const pending = cps.getPendingByRun(runId)!;
  expect(pending.stageId).toBe("draft");
});

test("decide 後不再是 pending", () => {
  const { cps, runId } = setup();
  const cp = cps.create({ runId, stageId: "draft", prompt: "OK 嗎？" });
  cps.decide(cp.id, "approved", "看起來不錯");
  expect(cps.getPendingByRun(runId)).toBeNull();
  const got = cps.listByRun(runId)[0];
  expect(got.decision).toBe("approved");
  expect(got.note).toBe("看起來不錯");
  expect(got.decidedAt).toBeString();
});

test("listByRun 回傳全部 checkpoint", () => {
  const { cps, runId } = setup();
  cps.create({ runId, stageId: "a", prompt: "1" });
  cps.create({ runId, stageId: "b", prompt: "2" });
  expect(cps.listByRun(runId)).toHaveLength(2);
});
