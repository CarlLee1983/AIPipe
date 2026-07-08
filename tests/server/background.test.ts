import { test, expect } from "bun:test";
import { openDb } from "../../src/store/db";
import { RunRepository } from "../../src/store/runs";
import { StepRepository } from "../../src/store/steps";
import { CheckpointRepository } from "../../src/store/checkpoints";
import { MockDriver } from "../../src/driver/mock";
import { createRun, prepareResume, type EngineDeps } from "../../src/engine/runner";
import { EventBus, type ServerEvent } from "../../src/server/events/bus";
import { startInBackground, resumeInBackground } from "../../src/server/background";
import type { Workflow } from "../../src/schema/workflow";

const yaml = `
name: demo
inputs: []
stages:
  - id: draft
    agent: { prompt: "寫草稿" }
    output: draft
    checkpoint: { prompt: "OK 嗎？" }
  - id: publish
    agent: { prompt: "發佈 {{draft}}" }
    output: final
`;
const wf = {
  name: "demo",
  inputs: [],
  stages: [
    { id: "draft", agent: { prompt: "寫草稿" }, output: "draft", checkpoint: { prompt: "OK 嗎？" } },
    { id: "publish", agent: { prompt: "發佈 {{draft}}" }, output: "final" },
  ],
} as unknown as Workflow;

function deps(driver: MockDriver): EngineDeps {
  const db = openDb(":memory:");
  return { runs: new RunRepository(db), steps: new StepRepository(db), checkpoints: new CheckpointRepository(db), driver };
}

function wait(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

test("startInBackground 轉發事件到 bus 且不阻塞呼叫者", async () => {
  const d = deps(new MockDriver([{ output: "草稿內容", delayMs: 20 }]));
  const bus = new EventBus();
  const events: ServerEvent[] = [];
  bus.subscribe((e) => events.push(e));

  const run = createRun(d, wf, {}, yaml);
  const start = Date.now();
  startInBackground(d, bus, run, wf);
  const elapsed = Date.now() - start;
  expect(elapsed).toBeLessThan(15); // 確認非阻塞（driver 有 delay 20ms）

  await wait(50); // 等背景跑完到 checkpoint
  expect(events.map((e) => e.type)).toEqual(["run:created", "stage:start", "stage:done", "run:checkpoint"]);
});

test("resumeInBackground approve 後繼續跑完，發送後續事件", async () => {
  const d = deps(new MockDriver([{ output: "草稿內容" }, { output: "已發佈" }]));
  const bus = new EventBus();
  const events: ServerEvent[] = [];
  bus.subscribe((e) => events.push(e));

  const run = createRun(d, wf, {}, yaml);
  startInBackground(d, bus, run, wf);
  await wait(20);

  const prep = prepareResume(d, run.id, { approve: true });
  resumeInBackground(d, bus, prep);
  await wait(20);

  expect(events.map((e) => e.type)).toContain("run:completed");
  expect(d.runs.get(run.id)!.status).toBe("completed");
});

test("resumeInBackground reject 發送 run:rejected", async () => {
  const d = deps(new MockDriver([{ output: "草稿內容" }]));
  const bus = new EventBus();
  const events: ServerEvent[] = [];
  bus.subscribe((e) => events.push(e));

  const run = createRun(d, wf, {}, yaml);
  startInBackground(d, bus, run, wf);
  await wait(20);

  const prep = prepareResume(d, run.id, { approve: false });
  resumeInBackground(d, bus, prep);
  await wait(10);

  expect(events.map((e) => e.type)).toContain("run:rejected");
});
