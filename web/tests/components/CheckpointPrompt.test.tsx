import "../../test-setup";
import { afterEach, expect, test } from "bun:test";
import { fireEvent, render, waitFor, within } from "@testing-library/react";
import { CheckpointPrompt } from "../../src/components/CheckpointPrompt";
import type { CheckpointRecord } from "../../src/api/types";

const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
});

const checkpoint = {
  id: "c1",
  runId: "r1",
  stageId: "draft",
  prompt: "OK 嗎？",
  decision: "pending",
  note: null,
  decidedAt: null,
} as CheckpointRecord;

test("點核可呼叫 approve 並回呼 onDecided", async () => {
  let called = false;
  globalThis.fetch = (async () => new Response(JSON.stringify({ success: true, data: { id: "r1", status: "running" } }), { status: 200 })) as typeof fetch;
  const view = render(<CheckpointPrompt runId="r1" checkpoint={checkpoint} onDecided={() => { called = true; }} />);
  const root = within(view.container);
  expect(root.getByText("OK 嗎？")).toBeDefined();
  fireEvent.click(root.getByText("▶ 核可"));
  await waitFor(() => expect(called).toBe(true));
});
