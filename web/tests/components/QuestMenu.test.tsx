import "../../test-setup";
import { expect, test } from "bun:test";
import { render, within } from "@testing-library/react";
import { QuestMenu, statusLabel } from "../../src/components/QuestMenu";
import type { Run } from "../../src/api/types";

const runs = [
  { id: "r1", workflowName: "write-blog-post", status: "running" } as Run,
  { id: "r2", workflowName: "summarize", status: "paused" } as Run,
];

test("statusLabel 對應中文", () => {
  expect(statusLabel("running")).toBe("執行中");
  expect(statusLabel("paused")).toBe("待核可");
  expect(statusLabel("completed")).toBe("完成");
});

test("QuestMenu 列出 run 與狀態", () => {
  const view = render(<QuestMenu runs={runs} selectedId="r1" onSelect={() => {}} />);
  const root = within(view.container);
  expect(root.getByText("write-blog-post")).toBeDefined();
  expect(root.getByText("待核可")).toBeDefined();
});
