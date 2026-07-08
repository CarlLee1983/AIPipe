import "../../test-setup";
import { afterEach, expect, test } from "bun:test";
import { fireEvent, render, waitFor, within } from "@testing-library/react";
import { NewQuestForm } from "../../src/components/NewQuestForm";
import type { WorkflowSummary } from "../../src/api/types";

const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
});

const workflows: WorkflowSummary[] = [
  { name: "write-blog-post", inputs: [{ name: "topic", required: true }], file: "write-blog-post.yaml" },
];

test("送出表單呼叫 createRun 並回呼 onCreated", async () => {
  let createdId = "";
  globalThis.fetch = (async () => new Response(JSON.stringify({ success: true, data: { runId: "r9", status: "pending" } }), { status: 201 })) as typeof fetch;
  const view = render(<NewQuestForm workflows={workflows} onCreated={(id) => { createdId = id; }} />);
  const root = within(view.container);
  fireEvent.change(root.getByLabelText("topic"), { target: { value: "Bun" } });
  fireEvent.click(root.getByText("發佈任務"));
  await waitFor(() => expect(createdId).toBe("r9"));
});
