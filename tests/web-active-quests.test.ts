import { test, expect } from "bun:test";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const webDir = join(import.meta.dir, "../web");

test("ActiveQuests 與 RunView 元件檔案存在且匯出正確型別與函式", () => {
  expect(existsSync(join(webDir, "src/components/ActiveQuests.tsx"))).toBe(true);
  expect(existsSync(join(webDir, "src/components/RunView.tsx"))).toBe(true);

  const activeCode = readFileSync(join(webDir, "src/components/ActiveQuests.tsx"), "utf-8");
  expect(activeCode).toContain("export function ActiveQuests");
  expect(activeCode).toContain("client.listRuns");
  expect(activeCode).toContain("RunView");

  const viewCode = readFileSync(join(webDir, "src/components/RunView.tsx"), "utf-8");
  expect(viewCode).toContain("export function RunView");
  expect(viewCode).toContain("client.getRun");
  expect(viewCode).toContain("client.subscribeEvents");
});
