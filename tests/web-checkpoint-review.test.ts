import { test, expect } from "bun:test";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const webDir = join(import.meta.dir, "../web");

test("CheckpointReview 元件檔案存在且匯出正確型別與函式", () => {
  expect(existsSync(join(webDir, "src/components/CheckpointReview.tsx"))).toBe(true);

  const code = readFileSync(join(webDir, "src/components/CheckpointReview.tsx"), "utf-8");
  expect(code).toContain("export function CheckpointReview");
  expect(code).toContain("client.resumeRun");
  expect(code).toContain("onResolved");
});

test("RunView 整合 CheckpointReview 元件與 Task 12 審核意見修改", () => {
  const runViewCode = readFileSync(join(webDir, "src/components/RunView.tsx"), "utf-8");
  expect(runViewCode).toContain("CheckpointReview");
  expect(runViewCode).toContain(".slice(-300)");
  expect(runViewCode).not.toContain("as any");
});

test("ActiveQuests 整合 Task 12 審核意見修改", () => {
  const activeCode = readFileSync(join(webDir, "src/components/ActiveQuests.tsx"), "utf-8");
  expect(activeCode).toContain("setError(null)");
  expect(activeCode).toContain("catch (err: unknown)");
});

test("App.css 包含 CheckpointReview 奇幻公會審查面板樣式", () => {
  const css = readFileSync(join(webDir, "src/App.css"), "utf-8");
  expect(css).toContain(".checkpoint-review");
  expect(css).toContain(".review-card");
  expect(css).toContain(".btn-approve");
  expect(css).toContain(".btn-reject");
});
