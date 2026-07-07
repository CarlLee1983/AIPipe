import { test, expect } from "bun:test";
import { openDb } from "../../src/store/db";
import { RunRepository } from "../../src/store/runs";
import { StepRepository } from "../../src/store/steps";
import { CheckpointRepository } from "../../src/store/checkpoints";
import { MockDriver } from "../../src/driver/mock";
import { startRun, resumeRun, type EngineDeps } from "../../src/engine/runner";
import { loadWorkflowFromString } from "../../src/schema/parse";

const yaml = `
name: demo
stages:
  - id: draft
    agent: { prompt: "寫草稿" }
    output: draft
    checkpoint: { prompt: "OK 嗎？" }
  - id: publish
    agent: { prompt: "發佈 {{draft}}" }
    output: final
`;

function deps(driver: MockDriver): EngineDeps {
  const db = openDb(":memory:");
  return {
    runs: new RunRepository(db),
    steps: new StepRepository(db),
    checkpoints: new CheckpointRepository(db),
    driver,
  };
}

test("approve 從下一階段續跑至 completed", async () => {
  const driver = new MockDriver([{ output: "草稿內容" }, { output: "最終稿" }]);
  const d = deps(driver);
  const { workflow } = loadWorkflowFromString(yaml);

  const paused = await startRun(d, workflow, {}, yaml);
  expect(paused.status).toBe("paused");

  const done = await resumeRun(d, paused.id, { approve: true, note: "讚" });
  expect(done.status).toBe("completed");
  expect(done.context.final).toBe("最終稿");
  // publish 階段有內插 checkpoint 前存下的 draft
  expect(driver.calls[1].prompt).toBe("發佈 草稿內容");
  const cp = d.checkpoints.listByRun(paused.id)[0];
  expect(cp.decision).toBe("approved");
  expect(cp.note).toBe("讚");
});

test("reject → run rejected 且不再續跑", async () => {
  const driver = new MockDriver([{ output: "草稿內容" }]);
  const d = deps(driver);
  const { workflow } = loadWorkflowFromString(yaml);

  const paused = await startRun(d, workflow, {}, yaml);
  const rejected = await resumeRun(d, paused.id, { approve: false, note: "重寫" });

  expect(rejected.status).toBe("rejected");
  expect(driver.calls).toHaveLength(1); // publish 未跑
  expect(d.checkpoints.listByRun(paused.id)[0].decision).toBe("rejected");
});

test("resume 非 paused 的 run → 擲錯", async () => {
  const driver = new MockDriver([]);
  const d = deps(driver);
  const run = d.runs.create({ workflowName: "demo", workflowSnapshot: yaml, inputs: {}, context: {}, status: "completed" });
  await expect(resumeRun(d, run.id, { approve: true })).rejects.toThrow(/paused/);
});

test("resume 不存在的 run → 擲錯", async () => {
  await expect(resumeRun(deps(new MockDriver([])), "nope", { approve: true })).rejects.toThrow(/找不到|not found|nope/);
});
