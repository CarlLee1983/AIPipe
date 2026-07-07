// tests/integration/quest.test.ts
import { test, expect } from "bun:test";
import { buildDeps } from "../../src/cli/deps";
import { MockDriver } from "../../src/driver/mock";
import { runCommand } from "../../src/cli/commands/run";
import { approveCommand } from "../../src/cli/commands/approve";
import { rejectCommand } from "../../src/cli/commands/reject";
import { loadWorkflowFile } from "../../src/schema/parse";
import { startRun, resumeRun, type EngineDeps } from "../../src/engine/runner";

const wfPath = new URL("../../workflows/write-blog-post.yaml", import.meta.url).pathname;

test("範例 YAML 通過載入驗證且無警告", async () => {
  const { workflow, warnings } = await loadWorkflowFile(wfPath);
  expect(workflow.name).toBe("write-blog-post");
  expect(warnings).toEqual([]);
});

test("核心驗收路徑：run → paused → approve → completed", async () => {
  const deps = buildDeps({
    dbPath: ":memory:",
    driver: new MockDriver([
      { output: "重點一二三" },
      { output: "一篇草稿" },
      { output: "最終格式" },
    ]),
  });

  const runOut = await runCommand(deps, { file: wfPath, inputs: { topic: "Bun 入門" } });
  expect(runOut).toContain("paused");

  const runId = deps.runs.list()[0].id;
  const approveOut = await approveCommand(deps, { runId });
  expect(approveOut).toContain("completed");

  const run = deps.runs.get(runId)!;
  expect(run.context.final).toBe("最終格式");
  expect(deps.steps.listByRun(runId)).toHaveLength(3);
});

test("reject 路徑：run → paused → reject → rejected", async () => {
  const deps = buildDeps({
    dbPath: ":memory:",
    driver: new MockDriver([{ output: "重點" }, { output: "草稿" }]),
  });
  await runCommand(deps, { file: wfPath, inputs: { topic: "x" } });
  const runId = deps.runs.list()[0].id;
  const out = await rejectCommand(deps, { runId, note: "不行" });
  expect(out).toContain("rejected");
});

test("driver 失敗路徑：第一階段失敗 → failed", async () => {
  const deps = buildDeps({
    dbPath: ":memory:",
    driver: new MockDriver([{ output: "", success: false }]),
  });
  const out = await runCommand(deps, { file: wfPath, inputs: { topic: "x" } });
  expect(out).toContain("failed");
});

test("跨行程恢復：不同 deps 各開同一 sqlite 檔案，approve 後仍續跑", async () => {
  const dbFile = `/tmp/aipipe-test-${crypto.randomUUID()}.sqlite`;

  // 「行程 A」：起跑到 checkpoint
  const depsA: EngineDeps = buildDeps({
    dbPath: dbFile,
    driver: new MockDriver([{ output: "重點" }, { output: "草稿" }]),
  });
  const { workflow } = await loadWorkflowFile(wfPath);
  const source = await Bun.file(wfPath).text();
  const paused = await startRun(depsA, workflow, { topic: "x" }, source);
  expect(paused.status).toBe("paused");

  // 「行程 B」：全新 deps（新 driver、重新開檔），只靠 SQLite 狀態恢復
  const depsB: EngineDeps = buildDeps({
    dbPath: dbFile,
    driver: new MockDriver([{ output: "最終" }]),
  });
  const done = await resumeRun(depsB, paused.id, { approve: true });
  expect(done.status).toBe("completed");
  expect(done.context.final).toBe("最終");
});
