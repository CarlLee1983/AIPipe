import { test, expect, beforeAll, afterAll } from "bun:test";
import { mkdir, writeFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { MockDriver } from "../../src/driver/mock";
import { startServer } from "../../src/server/index";
import { createClient } from "../../src/server/client";

const tmpDir = join(import.meta.dir, ".tmp-api");
let serverInstance: ReturnType<typeof startServer>;
let client: ReturnType<typeof createClient>;

beforeAll(async () => {
  await mkdir(tmpDir, { recursive: true });
  await writeFile(join(tmpDir, "demo.yaml"), "name: demo\ninputs: []\nstages:\n  - id: s1\n    agent: { prompt: p }\n    output: o\n    checkpoint: { prompt: cp }\n  - id: s2\n    agent: { prompt: p2 }\n");

  serverInstance = startServer({
    port: 0, // 隨機 port 或 Bun.serve assigned port
    dbPath: ":memory:",
    workflowsDir: tmpDir,
    driver: new MockDriver([{ output: "o1" }, { output: "o2" }]),
  });
  client = createClient(`http://localhost:${serverInstance.server.port}`);
});

afterAll(async () => {
  serverInstance?.stop();
  await rm(tmpDir, { recursive: true, force: true });
});

test("API Client 整合測試：建立、查詢列表、取得詳細、恢復、訂閱事件", async () => {
  // 1. 建立 run
  const created = await client.createRun("demo");
  expect(created.status).toBe("running");
  expect(created.workflow).toBe("demo");

  // 2. 查詢列表
  const list = await client.listRuns();
  expect(list.length).toBeGreaterThanOrEqual(1);
  expect(list.some((r) => r.id === created.runId)).toBe(true);

  // 3. 取得詳細
  const detail = await client.getRun(created.runId);
  expect(detail.run.id).toBe(created.runId);

  // 等待第一關跑完進入 paused
  await new Promise((r) => setTimeout(r, 50));
  const pausedDetail = await client.getRun(created.runId);
  expect(pausedDetail.run.status).toBe("paused");
  expect(pausedDetail.checkpoints.length).toBeGreaterThanOrEqual(1);

  // 4. 恢復 run
  const resumed = await client.resumeRun(created.runId, true, "Looks good");
  expect(resumed.status).toBe("running");

  // 等待第二關跑完
  await new Promise((r) => setTimeout(r, 50));
  const finalDetail = await client.getRun(created.runId);
  expect(finalDetail.run.status).toBe("completed");
});

test("API Client subscribeEvents 接收 SSE 事件", async () => {
  const created = await client.createRun("demo");
  const events: string[] = [];

  const unsubscribe = client.subscribeEvents(created.runId, (e) => {
    events.push(e.type);
  });

  await new Promise((r) => setTimeout(r, 60));
  unsubscribe();

  expect(events).toContain("run:created");
  expect(events).toContain("stage:start");
});
