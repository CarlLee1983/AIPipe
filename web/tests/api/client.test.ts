import { afterEach, expect, test } from "bun:test";
import { api } from "../../src/api/client";

const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
});

function mockFetch(status: number, body: unknown) {
  globalThis.fetch = (async () => new Response(JSON.stringify(body), { status })) as typeof fetch;
}

test("createRun 回 data", async () => {
  mockFetch(201, { success: true, data: { runId: "r1", status: "pending" } });
  const data = await api.createRun("wf", { topic: "Bun" });
  expect(data.runId).toBe("r1");
});

test("envelope success:false 擲 Error 帶訊息", async () => {
  mockFetch(404, { success: false, error: "找不到 workflow：nope" });
  await expect(api.createRun("nope", {})).rejects.toThrow(/找不到 workflow/);
});

test("getRun 回 RunDetail", async () => {
  mockFetch(200, { success: true, data: { run: { id: "r1", status: "paused" }, steps: [], checkpoints: [] } });
  const detail = await api.getRun("r1");
  expect(detail.run.status).toBe("paused");
});
