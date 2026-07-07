import { test, expect } from "bun:test";
import { buildDeps } from "../../src/cli/deps";
import { MockDriver } from "../../src/driver/mock";
import { runCommand } from "../../src/cli/commands/run";
import { listCommand } from "../../src/cli/commands/list";
import { showCommand } from "../../src/cli/commands/show";
import { approveCommand } from "../../src/cli/commands/approve";
import { rejectCommand } from "../../src/cli/commands/reject";

const wfPath = new URL("./fixtures/checkpoint.yaml", import.meta.url).pathname;

// 用一個共享的 in-memory DB，讓 run 後能 approve（同一連線）
function ctx(driver: MockDriver) {
  return buildDeps({ dbPath: ":memory:", driver });
}

test("run 命中 checkpoint → 輸出含 paused 與 checkpoint prompt", async () => {
  const deps = ctx(new MockDriver([{ output: "草稿內容" }]));
  const out = await runCommand(deps, { file: wfPath, inputs: {} });
  expect(out).toContain("paused");
  expect(out).toContain("OK 嗎？"); // checkpoint prompt
  expect(out).toContain("approve"); // 提示核可指令
});

test("list 顯示 run 與狀態", async () => {
  const deps = ctx(new MockDriver([{ output: "草稿內容" }]));
  await runCommand(deps, { file: wfPath, inputs: {} });
  const out = listCommand(deps);
  expect(out).toContain("paused");
  expect(out).toContain("demo");
});

test("approve 續跑到 completed；show 顯示步驟", async () => {
  const deps = ctx(new MockDriver([{ output: "草稿內容" }, { output: "最終稿" }]));
  const runOut = await runCommand(deps, { file: wfPath, inputs: {} });
  const runId = deps.runs.list()[0].id;

  const approveOut = await approveCommand(deps, { runId, note: "讚" });
  expect(approveOut).toContain("completed");

  const showOut = showCommand(deps, { runId });
  expect(showOut).toContain("draft");   // stage id
  expect(showOut).toContain("publish");
  expect(showOut).toContain("completed");
  expect(runOut).toContain("paused");
});

test("reject 終止 run", async () => {
  const deps = ctx(new MockDriver([{ output: "草稿內容" }]));
  await runCommand(deps, { file: wfPath, inputs: {} });
  const runId = deps.runs.list()[0].id;
  const out = await rejectCommand(deps, { runId, note: "重寫" });
  expect(out).toContain("rejected");
});
