import { test, expect } from "bun:test";
import { openDb } from "../../src/store/db";
import { RunRepository } from "../../src/store/runs";
import { StepRepository } from "../../src/store/steps";
import { CheckpointRepository } from "../../src/store/checkpoints";
import { MockDriver } from "../../src/driver/mock";
import { startRun, type EngineDeps } from "../../src/engine/runner";
import type { Workflow } from "../../src/schema/workflow";

function deps(driver: MockDriver): EngineDeps {
  const db = openDb(":memory:");
  return {
    runs: new RunRepository(db),
    steps: new StepRepository(db),
    checkpoints: new CheckpointRepository(db),
    driver,
  };
}

const twoStage = {
  name: "demo",
  inputs: [{ name: "topic", required: true, default: undefined }],
  stages: [
    { id: "research", agent: { prompt: "研究 {{topic}}" }, output: "notes" },
    { id: "draft", agent: { prompt: "根據 {{notes}} 撰稿" }, output: "draft" },
  ],
} as unknown as Workflow;

const twoStageYaml = `
name: demo
inputs:
  - name: topic
    required: true
stages:
  - id: research
    agent: { prompt: "研究 {{topic}}" }
    output: notes
  - id: draft
    agent: { prompt: "根據 {{notes}} 撰稿" }
    output: draft
`;

test("無 checkpoint 的 workflow 一路跑到 completed", async () => {
  const driver = new MockDriver([{ output: "研究結果" }, { output: "草稿" }]);
  const d = deps(driver);
  const run = await startRun(d, twoStage, { topic: "Bun" }, twoStageYaml);

  expect(run.status).toBe("completed");
  expect(run.context.notes).toBe("研究結果");
  expect(run.context.draft).toBe("草稿");
  // 第二階段 prompt 應已內插第一階段 output
  expect(driver.calls[1].prompt).toBe("根據 研究結果 撰稿");
  expect(d.steps.listByRun(run.id)).toHaveLength(2);
});

test("命中 checkpoint 暫停，current_stage_index 指向下一階段", async () => {
  const wf = {
    name: "demo",
    inputs: [],
    stages: [
      { id: "draft", agent: { prompt: "寫草稿" }, output: "draft", checkpoint: { prompt: "OK 嗎？" } },
      { id: "publish", agent: { prompt: "發佈 {{draft}}" }, output: "final" },
    ],
  } as unknown as Workflow;
  const checkpointYaml = `
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
  const driver = new MockDriver([{ output: "草稿內容" }]);
  const d = deps(driver);
  const run = await startRun(d, wf, {}, checkpointYaml);

  expect(run.status).toBe("paused");
  expect(run.currentStageIndex).toBe(1); // 指向 publish
  expect(driver.calls).toHaveLength(1); // publish 尚未執行
  const pending = d.checkpoints.getPendingByRun(run.id)!;
  expect(pending.stageId).toBe("draft");
});

test("driver 失敗 → run failed 並中止", async () => {
  const driver = new MockDriver([{ output: "", success: false }]);
  const d = deps(driver);
  const run = await startRun(d, twoStage, { topic: "Bun" }, twoStageYaml);

  expect(run.status).toBe("failed");
  expect(driver.calls).toHaveLength(1); // 第二階段未跑
  const step = d.steps.listByRun(run.id)[0];
  expect(step.status).toBe("failed");
});

test("缺 required input → 擲錯", async () => {
  const driver = new MockDriver([]);
  await expect(startRun(deps(driver), twoStage, {}, twoStageYaml)).rejects.toThrow(/topic/);
});
