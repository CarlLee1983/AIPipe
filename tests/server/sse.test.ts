import { test, expect } from "bun:test";
import { openDb } from "../../src/store/db";
import { RunRepository } from "../../src/store/runs";
import { StepRepository } from "../../src/store/steps";
import { CheckpointRepository } from "../../src/store/checkpoints";
import { MockDriver } from "../../src/driver/mock";
import { EventBus } from "../../src/server/events/bus";
import { sseHandler } from "../../src/server/sse";
import type { EngineDeps } from "../../src/engine/runner";

function setup() {
  const db = openDb(":memory:");
  const deps: EngineDeps = {
    runs: new RunRepository(db),
    steps: new StepRepository(db),
    checkpoints: new CheckpointRepository(db),
    driver: new MockDriver([]),
  };
  const bus = new EventBus();
  return { deps, bus };
}

test("sseHandler 找不到 run 回 404", async () => {
  const { deps, bus } = setup();
  const res = sseHandler(new Request("http://localhost/api/runs/x/events"), bus, deps, "x");
  expect(res.status).toBe(404);
});

test("sseHandler 回傳 SSE headers 且連線後送出舊事件與新事件", async () => {
  const { deps, bus } = setup();
  const run = deps.runs.create({ workflowName: "demo", workflowSnapshot: "x", inputs: {}, context: {} });
  deps.steps.create({ runId: run.id, stageId: "s1", prompt: "p" });

  const res = sseHandler(new Request(`http://localhost/api/runs/${run.id}/events`), bus, deps, run.id);
  expect(res.status).toBe(200);
  expect(res.headers.get("Content-Type")).toBe("text/event-stream");
  expect(res.headers.get("Cache-Control")).toBe("no-cache");

  const reader = res.body!.getReader();
  const decoder = new TextDecoder();

  // 讀取第一封包（舊事件：run:created 與 stage:start）
  const { value } = await reader.read();
  const text = decoder.decode(value);
  expect(text).toContain("run:created");
  expect(text).toContain("stage:start");

  // 在 bus 發送新事件
  bus.emit({
    type: "stage:done",
    timestamp: Date.now(),
    data: { runId: run.id, stageId: "s1", output: "ok" },
  });

  const { value: val2 } = await reader.read();
  const text2 = decoder.decode(val2);
  expect(text2).toContain("stage:done");
  expect(text2).toContain("ok");

  await reader.cancel();
});

test("sseHandler 補發歷史事件 (stage:done 與 run:checkpoint) 且 timestamp 為數字", async () => {
  const { deps, bus } = setup();
  const run = deps.runs.create({ workflowName: "demo", workflowSnapshot: "x", inputs: {}, context: {} });
  const step = deps.steps.create({ runId: run.id, stageId: "s1", prompt: "p" });
  deps.steps.complete(step.id, "output_result");
  deps.runs.updateStatus(run.id, "paused");
  deps.checkpoints.create({ runId: run.id, stageId: "s2", prompt: "approve?" });

  const res = sseHandler(new Request(`http://localhost/api/runs/${run.id}/events`), bus, deps, run.id);
  expect(res.status).toBe(200);

  const reader = res.body!.getReader();
  const decoder = new TextDecoder();

  const { value } = await reader.read();
  const text = decoder.decode(value);
  expect(text).toContain("run:created");
  expect(text).toContain("stage:start");
  expect(text).toContain("stage:done");
  expect(text).toContain("output_result");
  expect(text).toContain("run:checkpoint");
  expect(text).toContain("approve?");

  // 驗證 timestamp 是數字而非字串
  const lines = text.split("\n\n").filter(Boolean);
  for (const line of lines) {
    if (line.startsWith("data: ")) {
      const parsed = JSON.parse(line.slice(6));
      expect(typeof parsed.timestamp).toBe("number");
      expect(Number.isNaN(parsed.timestamp)).toBe(false);
    }
  }

  await reader.cancel();
});
