import { test, expect, beforeAll, afterAll } from "bun:test";
import { mkdir, writeFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { openDb } from "../../../src/store/db";
import { RunRepository } from "../../../src/store/runs";
import { StepRepository } from "../../../src/store/steps";
import { CheckpointRepository } from "../../../src/store/checkpoints";
import { MockDriver } from "../../../src/driver/mock";
import { EventBus } from "../../../src/server/events/bus";
import { WorkflowCatalog } from "../../../src/server/workflows";
import { createRunHandler, resumeRunHandler, getRunHandler } from "../../../src/server/routes/runs";
import type { EngineDeps } from "../../../src/engine/runner";

const tmpDir = join(import.meta.dir, ".tmp-routes");

beforeAll(async () => {
  await mkdir(tmpDir, { recursive: true });
  await writeFile(join(tmpDir, "demo.yaml"), "name: demo\ninputs: []\nstages:\n  - id: s1\n    agent: { prompt: p }\n    output: o\n    checkpoint: { prompt: cp }\n  - id: s2\n    agent: { prompt: p2 }\n");
});

afterAll(async () => {
  await rm(tmpDir, { recursive: true, force: true });
});

function setup() {
  const db = openDb(":memory:");
  const deps: EngineDeps = {
    runs: new RunRepository(db),
    steps: new StepRepository(db),
    checkpoints: new CheckpointRepository(db),
    driver: new MockDriver([{ output: "o1" }, { output: "o2" }]),
  };
  const catalog = new WorkflowCatalog(tmpDir);
  const bus = new EventBus();
  return { deps, catalog, bus };
}

function jsonReq(method: string, url: string, body?: unknown): Request {
  return new Request(url, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
}

test("POST createRunHandler 建立並背景執行回 201", async () => {
  const { deps, catalog, bus } = setup();
  const req = jsonReq("POST", "http://localhost/api/runs", { workflow: "demo" });
  const res = await createRunHandler(req, deps, catalog, bus);
  expect(res.status).toBe(201);
  const data = await res.json();
  expect(data.status).toBe("running");
  expect(data.workflow).toBe("demo");
  expect(typeof data.runId).toBe("string");
});

test("POST createRunHandler workflow 不存在回 404", async () => {
  const { deps, catalog, bus } = setup();
  const req = jsonReq("POST", "http://localhost/api/runs", { workflow: "nope" });
  const res = await createRunHandler(req, deps, catalog, bus);
  expect(res.status).toBe(404);
});

test("POST createRunHandler 驗證失敗回 400", async () => {
  const { deps, catalog, bus } = setup();
  const req = jsonReq("POST", "http://localhost/api/runs", {}); // 缺 workflow
  const res = await createRunHandler(req, deps, catalog, bus);
  expect(res.status).toBe(400);
});

test("GET getRunHandler 取得 run 詳細資料；找不到回 404", async () => {
  const { deps, catalog, bus } = setup();
  const req = jsonReq("POST", "http://localhost/api/runs", { workflow: "demo" });
  const createRes = await createRunHandler(req, deps, catalog, bus);
  const { runId } = await createRes.json();

  const getRes = await getRunHandler(new Request(`http://localhost/api/runs/${runId}`), deps, runId);
  expect(getRes.status).toBe(200);
  const runData = await getRes.json();
  expect(runData.id).toBe(runId);

  const notFound = await getRunHandler(new Request("http://localhost/api/runs/x"), deps, "x");
  expect(notFound.status).toBe(404);
});

test("POST resumeRunHandler 在 paused 狀態 approve 回 200；非 paused 回 409", async () => {
  const { deps, catalog, bus } = setup();
  const req = jsonReq("POST", "http://localhost/api/runs", { workflow: "demo" });
  const { runId } = await (await createRunHandler(req, deps, catalog, bus)).json();

  // 等待跑完第一關進入 paused
  await new Promise((r) => setTimeout(r, 30));
  expect(deps.runs.get(runId)!.status).toBe("paused");

  const resumeReq = jsonReq("POST", `http://localhost/api/runs/${runId}/resume`, { approve: true });
  const res = await resumeRunHandler(resumeReq, deps, catalog, bus, runId);
  expect(res.status).toBe(200);
  const data = await res.json();
  expect(data.status).toBe("running");

  // 已不是 paused 狀態再次 resume 回 409
  const resumeReq2 = jsonReq("POST", `http://localhost/api/runs/${runId}/resume`, { approve: true });
  const again = await resumeRunHandler(resumeReq2, deps, catalog, bus, runId);
  expect(again.status).toBe(409);
});
