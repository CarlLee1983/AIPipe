import { test, expect } from "bun:test";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const webDir = join(import.meta.dir, "../web");

test("QuestBoard 與 QuestCard 元件檔案存在且匯出正確型別與函式", () => {
  expect(existsSync(join(webDir, "src/components/QuestCard.tsx"))).toBe(true);
  expect(existsSync(join(webDir, "src/components/QuestBoard.tsx"))).toBe(true);

  const boardCode = readFileSync(join(webDir, "src/components/QuestBoard.tsx"), "utf-8");
  expect(boardCode).toContain("export function QuestBoard");
  expect(boardCode).toContain("client.listWorkflows");
  expect(boardCode).toContain("client.createRun");

  const cardCode = readFileSync(join(webDir, "src/components/QuestCard.tsx"), "utf-8");
  expect(cardCode).toContain("export function QuestCard");
  expect(cardCode).toContain("onSelect");
});
