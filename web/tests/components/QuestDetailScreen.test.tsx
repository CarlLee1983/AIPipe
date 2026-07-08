import "../../test-setup";
import { expect, test } from "bun:test";
import { fireEvent, render, within } from "@testing-library/react";
import { QuestDetailScreen } from "../../src/components/QuestDetailScreen";
import type { RunDetail } from "../../src/api/types";

function makeDetail(overrides: Partial<RunDetail> = {}): RunDetail {
  return {
    run: {
      id: "run-1",
      workflowName: "demo",
      status: "paused",
      inputs: {},
      context: {},
      currentStageIndex: 1,
      createdAt: "2026-07-08T00:00:00Z",
      updatedAt: "2026-07-08T00:00:00Z",
    },
    steps: [
      {
        id: "s1",
        runId: "run-1",
        stageId: "調查",
        output: "找到線索",
        status: "completed",
        error: null,
        startedAt: "2026-07-08T00:00:00Z",
        endedAt: "2026-07-08T00:00:01Z",
      },
    ],
    checkpoints: [],
    ...overrides,
  };
}

test("有 pending checkpoint 時顯示提示與核可鈕，返回鈕呼叫 onBack", () => {
  let back = 0;
  const detail = makeDetail({
    checkpoints: [
      { id: "c1", runId: "run-1", stageId: "調查", prompt: "資料看起來 OK 嗎？", decision: "pending", note: null, decidedAt: null },
    ],
  });
  const view = render(
    <QuestDetailScreen
      runId="run-1"
      detail={detail}
      onBack={() => { back += 1; }}
      onDecided={() => {}}
      onApprove={() => {}}
    />,
  );
  const root = within(view.container);
  expect(root.getByText("冒險日誌")).toBeDefined();
  expect(root.getByText("資料看起來 OK 嗎？")).toBeDefined();
  expect(root.getByRole("button", { name: "▶ 核可" })).toBeDefined();
  fireEvent.click(root.getByRole("button", { name: "← 返回大廳" }));
  expect(back).toBe(1);
});
