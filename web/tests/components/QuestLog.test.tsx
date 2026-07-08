import "../../test-setup";
import { expect, test } from "bun:test";
import { render, within } from "@testing-library/react";
import { QuestLog, stepStatusLabel } from "../../src/components/QuestLog";
import type { StepRecord } from "../../src/api/types";

function step(over: Partial<StepRecord>): StepRecord {
  return {
    id: "s",
    runId: "r1",
    stageId: "draft",
    prompt: "寫草稿",
    input: "",
    output: null,
    status: "running",
    error: null,
    startedAt: "",
    endedAt: null,
    ...over,
  };
}

test("stepStatusLabel 對應中文", () => {
  expect(stepStatusLabel("running")).toContain("挑戰中");
  expect(stepStatusLabel("completed")).toContain("突破");
  expect(stepStatusLabel("failed")).toContain("失敗");
  expect(stepStatusLabel("pending")).toContain("等待");
});

test("空步驟顯示尚未開始提示", () => {
  const view = render(<QuestLog steps={[]} />);
  expect(within(view.container).getByText(/尚未踏上旅程|尚未開始/)).toBeDefined();
});

test("逐關卡列出 stageId、狀態與產出", () => {
  const steps = [
    step({ id: "s1", stageId: "research", status: "completed", output: "研究筆記內容" }),
    step({ id: "s2", stageId: "finalize", status: "running", output: null }),
  ];
  const view = render(<QuestLog steps={steps} />);
  const root = within(view.container);
  expect(root.getByText(/research/)).toBeDefined();
  expect(root.getByText("研究筆記內容")).toBeDefined();
  expect(root.getByText(/finalize/)).toBeDefined();
  // 第一關已完成、第二關挑戰中
  expect(root.getByText(/突破/)).toBeDefined();
  expect(root.getByText(/挑戰中/)).toBeDefined();
});

test("失敗步驟顯示錯誤訊息", () => {
  const steps = [step({ id: "s1", stageId: "draft", status: "failed", error: "driver 回報失敗" })];
  const view = render(<QuestLog steps={steps} />);
  expect(within(view.container).getByText(/driver 回報失敗/)).toBeDefined();
});
