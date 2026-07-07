import { test, expect } from "bun:test";
import {
  buildClaudeArgs,
  parseClaudeJson,
  ClaudeCodeDriver,
  type ProcRunner,
} from "../../src/driver/claude-code";

test("buildClaudeArgs 組出正確參數", () => {
  const args = buildClaudeArgs({
    prompt: "hi",
    allowedTools: ["Read", "WebSearch"],
    model: "opus",
  });
  expect(args).toEqual([
    "claude", "-p", "hi",
    "--output-format", "json",
    "--allowedTools", "Read,WebSearch",
    "--model", "opus",
  ]);
});

test("buildClaudeArgs 省略選填參數", () => {
  const args = buildClaudeArgs({ prompt: "hi" });
  expect(args).toEqual(["claude", "-p", "hi", "--output-format", "json"]);
});

test("parseClaudeJson 取 result 欄位", () => {
  const { output } = parseClaudeJson(JSON.stringify({ result: "答案", is_error: false }));
  expect(output).toBe("答案");
});

test("parseClaudeJson 遇無效 JSON 擲錯", () => {
  expect(() => parseClaudeJson("not json")).toThrow();
});

test("run：exit 0 且 is_error=false → success", async () => {
  const fakeRun: ProcRunner = async () => ({
    stdout: JSON.stringify({ result: "ok", is_error: false }),
    exitCode: 0,
  });
  const driver = new ClaudeCodeDriver({ run: fakeRun });
  const r = await driver.run({ prompt: "x" });
  expect(r.success).toBe(true);
  expect(r.output).toBe("ok");
});

test("run：非零退出 → success false", async () => {
  const fakeRun: ProcRunner = async () => ({ stdout: "", exitCode: 1 });
  const driver = new ClaudeCodeDriver({ run: fakeRun });
  const r = await driver.run({ prompt: "x" });
  expect(r.success).toBe(false);
});

test("run：is_error=true → success false", async () => {
  const fakeRun: ProcRunner = async () => ({
    stdout: JSON.stringify({ result: "", is_error: true }),
    exitCode: 0,
  });
  const driver = new ClaudeCodeDriver({ run: fakeRun });
  const r = await driver.run({ prompt: "x" });
  expect(r.success).toBe(false);
});

test("run：JSON 解析失敗 → success false 不擲錯", async () => {
  const fakeRun: ProcRunner = async () => ({ stdout: "garbage", exitCode: 0 });
  const driver = new ClaudeCodeDriver({ run: fakeRun });
  const r = await driver.run({ prompt: "x" });
  expect(r.success).toBe(false);
});

// 真實 claude 的 smoke test：需登入，預設跳過（設 AIPIPE_CLAUDE_SMOKE=1 才跑）
test.skipIf(!process.env.AIPIPE_CLAUDE_SMOKE)("smoke: 真實 claude 回應", async () => {
  const driver = new ClaudeCodeDriver();
  const r = await driver.run({ prompt: "只回覆 pong 兩字" });
  expect(r.success).toBe(true);
  expect(r.output.length).toBeGreaterThan(0);
});
