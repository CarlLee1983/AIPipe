import { test, expect } from "bun:test";
import { openDb } from "../../src/store/db";
import { RunRepository } from "../../src/store/runs";

function repo() {
  return new RunRepository(openDb(":memory:"));
}

test("create 產生 id 並可 get 回來", () => {
  const runs = repo();
  const run = runs.create({
    workflowName: "demo",
    workflowSnapshot: "name: demo",
    inputs: { topic: "Bun" },
    context: { topic: "Bun" },
  });
  expect(run.id).toBeString();
  expect(run.status).toBe("pending");
  expect(run.currentStageIndex).toBe(0);

  const got = runs.get(run.id)!;
  expect(got.inputs).toEqual({ topic: "Bun" });
  expect(got.context).toEqual({ topic: "Bun" });
  expect(got.workflowName).toBe("demo");
});

test("get 不存在回 null", () => {
  expect(repo().get("nope")).toBeNull();
});

test("updateStatus / updateContext / updateStageIndex 生效", () => {
  const runs = repo();
  const run = runs.create({
    workflowName: "demo", workflowSnapshot: "x", inputs: {}, context: {},
  });
  runs.updateStatus(run.id, "running");
  runs.updateContext(run.id, { a: "1" });
  runs.updateStageIndex(run.id, 2);

  const got = runs.get(run.id)!;
  expect(got.status).toBe("running");
  expect(got.context).toEqual({ a: "1" });
  expect(got.currentStageIndex).toBe(2);
});

test("list 依建立時間反序", () => {
  const runs = repo();
  const a = runs.create({ id: "a", workflowName: "d", workflowSnapshot: "x", inputs: {}, context: {} });
  const b = runs.create({ id: "b", workflowName: "d", workflowSnapshot: "x", inputs: {}, context: {} });
  const ids = runs.list().map((r) => r.id);
  expect(ids).toContain(a.id);
  expect(ids).toContain(b.id);
  expect(ids).toHaveLength(2);
});
