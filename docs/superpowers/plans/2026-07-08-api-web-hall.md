# API + 即時串流 + 勇者大廳 Web UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在既有 Quest Engine 上加一個最小 Bun 後端（HTTP + SSE）與 React/Vite 勇者大廳前端，讓使用者從瀏覽器發任務、即時看勇者逐階段幹活、在檢查點核可/駁回。

**Architecture:** 後端是引擎的第二個入口（CLI 是第一個），重用 `buildDeps()` 組依賴；`POST /api/runs` 非阻塞——建立 `pending` run 後立即回傳 runId，實際執行在背景跑，進度經引擎的 `observer` hook → in-process event bus → SSE 推給前端。引擎唯一改動是加 optional observer 與拆出 `createRun`/`prepareResume`（供非阻塞觸發/核可），狀態機邏輯不變。前端是 CT（超時空之鑰）風格的 React SPA，素材走設定驅動、缺檔 fallback CSS 佔位。

**Tech Stack:** Bun + TypeScript（後端、測試 `bun test`）、`Bun.serve`（HTTP/SSE/靜態檔）、React 18 + Vite（前端）、happy-dom + @testing-library/react（元件測試）、Playwright（E2E）、zod（邊界驗證）、既有 `bun:sqlite` 持久化。

## Global Constraints

- 語言：文件、程式註解、UI 文案用繁體中文（台灣用語）；程式識別字用英文。
- 檔案聚焦：200–400 行典型、800 行上限；多小檔勝過少大檔。
- 不可變：context 每階段回傳新物件，不原地改輸入（沿用引擎既有做法）。
- 邊界驗證：HTTP request body 用 zod 驗證；內部呼叫信任。
- 錯誤在有足夠 context 的邊界處理並附說明，不靜默吞掉。
- JSON 回應統一 envelope：`{ success: boolean, data?, error? }`。
- 引擎不得認識 HTTP/SSE；只吐語意事件。SSE observer callback 全程 try/catch，推送失敗不得影響狀態機。
- 測試目標覆蓋率 80%+，TDD（先寫失敗測試）。
- 後端預設埠 `3000`，可用環境變數 `AIPIPE_PORT` 覆寫；DB 路徑沿用 `AIPIPE_DB`（預設 `./aipipe.sqlite`）。
- 不引入非必要重依賴（沿用子專案 1 慣例）。

---

## File Structure

**後端 / 引擎（`src/`）**
- `engine/runner.ts` — 修改：加 `RunObserver` 型別、`observer?` 欄位、`createRun`、`prepareResume`
- `server/events/bus.ts` — 新增：per-run in-process 事件匯流排
- `server/validation.ts` — 新增：zod request body schema
- `server/workflows.ts` — 新增：掃 `workflows/` 目錄、回 workflow 摘要
- `server/background.ts` — 新增：observer→bus 綁定、背景執行 run
- `server/handlers.ts` — 新增：純函式路由 handler（回 `ApiResult`），易單元測試
- `server/sse.ts` — 新增：SSE Response 產生器（snapshot + 訂閱 + 心跳）
- `server/index.ts` — 新增：`createServer()` 路由 + 靜態檔；`main` 進入點

**前端（`web/`）**
- `web/package.json` · `web/vite.config.ts` · `web/tsconfig.json` · `web/index.html` · `web/test-setup.ts`
- `web/src/main.tsx` · `web/src/App.tsx`
- `web/src/api/client.ts`（fetch 封裝）· `web/src/api/sse.ts`（EventSource 封裝＋重連）
- `web/src/assets/assets.config.ts`（插槽路徑 + fallback 解析）
- `web/src/theme/ct-window.css` · `web/src/theme/scene.css`
- `web/src/components/`：`Scene.tsx` · `HudBar.tsx` · `QuestMenu.tsx` · `DialogBox.tsx` · `CheckpointPrompt.tsx` · `NewQuestForm.tsx`
- `web/src/hooks/useRun.ts` · `web/src/hooks/useRunEvents.ts`
- `web/tests/e2e/quest-flow.spec.ts`（Playwright）

**文件**
- `docs/assets/manifest.md` — 素材清單 + 生成 prompt

---

## Task 1: 引擎 — RunObserver hook

**Files:**
- Modify: `src/engine/runner.ts`
- Test: `tests/engine/runner.observer.test.ts`

**Interfaces:**
- Consumes: 既有 `EngineDeps`、`executeFrom(deps, run, workflow, fromIndex)`、`startRun(deps, workflow, inputs, source)`。
- Produces:
  - `RunObserver`（optional callbacks）：`onStageStart(e:{stageId:string;name?:string;index:number;prompt:string})`、`onStageDone(e:{stageId:string;output:string})`、`onCheckpoint(e:{stageId:string;prompt:string;checkpointId:string})`、`onRunDone(e:{status:"completed"})`、`onRunFailed(e:{stageId:string;error:string})`
  - `EngineDeps.observer?: RunObserver`

- [ ] **Step 1: 寫失敗測試**

Create `tests/engine/runner.observer.test.ts`:

```ts
import { test, expect } from "bun:test";
import { openDb } from "../../src/store/db";
import { RunRepository } from "../../src/store/runs";
import { StepRepository } from "../../src/store/steps";
import { CheckpointRepository } from "../../src/store/checkpoints";
import { MockDriver } from "../../src/driver/mock";
import { startRun, type EngineDeps, type RunObserver } from "../../src/engine/runner";
import type { Workflow } from "../../src/schema/workflow";

function recorderObserver(): { observer: RunObserver; events: string[] } {
  const events: string[] = [];
  const observer: RunObserver = {
    onStageStart: (e) => events.push(`start:${e.stageId}:${e.index}`),
    onStageDone: (e) => events.push(`done:${e.stageId}:${e.output}`),
    onCheckpoint: (e) => events.push(`cp:${e.stageId}`),
    onRunDone: () => events.push("run:done"),
    onRunFailed: (e) => events.push(`run:failed:${e.stageId}`),
  };
  return { observer, events };
}

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

function deps(driver: MockDriver, observer?: RunObserver): EngineDeps {
  const db = openDb(":memory:");
  return { runs: new RunRepository(db), steps: new StepRepository(db), checkpoints: new CheckpointRepository(db), driver, observer };
}

test("observer 依序收到 stage 事件並在 checkpoint 停止", async () => {
  const { observer, events } = recorderObserver();
  const run = await startRun(deps(new MockDriver([{ output: "草稿內容" }]), observer), wf, {}, yaml);
  expect(run.status).toBe("paused");
  expect(events).toEqual(["start:draft:0", "done:draft:草稿內容", "cp:draft"]);
});

test("driver 失敗時 observer 收到 onRunFailed", async () => {
  const { observer, events } = recorderObserver();
  const failWf = { name: "d", inputs: [], stages: [{ id: "a", agent: { prompt: "x" } }] } as unknown as Workflow;
  await startRun(deps(new MockDriver([{ output: "", success: false }]), observer), failWf, {}, "name: d\ninputs: []\nstages:\n  - id: a\n    agent: { prompt: x }");
  expect(events[0]).toBe("start:a:0");
  expect(events.some((e) => e.startsWith("run:failed:a"))).toBe(true);
});

test("不傳 observer 行為不變（一路跑完）", async () => {
  const okWf = { name: "d", inputs: [], stages: [{ id: "a", agent: { prompt: "x" }, output: "o" }] } as unknown as Workflow;
  const run = await startRun(deps(new MockDriver([{ output: "結果" }])), okWf, {}, "name: d\ninputs: []\nstages:\n  - id: a\n    agent: { prompt: x }\n    output: o");
  expect(run.status).toBe("completed");
});
```

- [ ] **Step 2: 執行測試確認失敗**

Run: `bun test tests/engine/runner.observer.test.ts`
Expected: FAIL —「Export named 'RunObserver' not found」或事件陣列不符。

- [ ] **Step 3: 實作 observer**

在 `src/engine/runner.ts`，於 `EngineDeps` 之前加型別，並在 `EngineDeps` 加 `observer` 欄位：

```ts
export interface RunObserver {
  onStageStart?(e: { stageId: string; name?: string; index: number; prompt: string }): void;
  onStageDone?(e: { stageId: string; output: string }): void;
  onCheckpoint?(e: { stageId: string; prompt: string; checkpointId: string }): void;
  onRunDone?(e: { status: "completed" }): void;
  onRunFailed?(e: { stageId: string; error: string }): void;
}
```

在 `EngineDeps` 介面加一行：`observer?: RunObserver;`

在 `executeFrom` 迴圈中插入呼叫（不改控制流）：

```ts
  for (let i = fromIndex; i < workflow.stages.length; i++) {
    const stage = workflow.stages[i];
    const { text: prompt, missing } = interpolate(stage.agent.prompt, context);
    for (const name of missing) {
      deps.logger?.(`run ${run.id}：stage "${stage.id}" 未定義變數 {{${name}}}，以空字串代入`);
    }

    deps.observer?.onStageStart?.({ stageId: stage.id, name: stage.name, index: i, prompt });
    const step = deps.steps.create({ runId: run.id, stageId: stage.id, prompt });
    const result = await deps.driver.run({
      prompt,
      allowedTools: stage.agent.allowedTools,
      model: stage.agent.model,
      cwd: stage.agent.cwd,
    });

    if (!result.success) {
      const error = `driver 回報失敗：${JSON.stringify(result.raw)}`;
      deps.steps.fail(step.id, error);
      deps.runs.updateStatus(run.id, "failed");
      deps.observer?.onRunFailed?.({ stageId: stage.id, error });
      return deps.runs.get(run.id)!;
    }

    deps.steps.complete(step.id, result.output);
    deps.observer?.onStageDone?.({ stageId: stage.id, output: result.output });
    if (stage.output) {
      context = withOutput(context, stage.output, result.output);
      deps.runs.updateContext(run.id, context);
    }

    if (stage.checkpoint) {
      const cp = deps.checkpoints.create({ runId: run.id, stageId: stage.id, prompt: stage.checkpoint.prompt });
      deps.runs.updateStageIndex(run.id, i + 1);
      deps.runs.updateStatus(run.id, "paused");
      deps.observer?.onCheckpoint?.({ stageId: stage.id, prompt: stage.checkpoint.prompt, checkpointId: cp.id });
      return deps.runs.get(run.id)!;
    }

    deps.runs.updateStageIndex(run.id, i + 1);
  }

  deps.runs.updateStatus(run.id, "completed");
  deps.observer?.onRunDone?.({ status: "completed" });
  return deps.runs.get(run.id)!;
```

（註：`checkpoints.create` 已回傳含 `id` 的 `CheckpointRecord`，改用回傳值取 `cp.id`。）

- [ ] **Step 4: 執行測試確認通過**

Run: `bun test tests/engine/runner.observer.test.ts`
Expected: PASS（3 個測試）。

- [ ] **Step 5: 回歸既有引擎測試**

Run: `bun test tests/engine`
Expected: 全數 PASS（既有 start/resume/context 測試不受影響）。

- [ ] **Step 6: Commit**

```bash
git add src/engine/runner.ts tests/engine/runner.observer.test.ts
git commit -m "feat: [engine] add optional RunObserver hook"
```

---

## Task 2: 引擎 — createRun 與 prepareResume（非阻塞拆分）

**Files:**
- Modify: `src/engine/runner.ts`
- Test: `tests/engine/runner.nonblocking.test.ts`

**Interfaces:**
- Consumes: `resolveInputs(workflow, inputs)`（`./context`）、`loadWorkflowFromString(text)`（`../schema/parse`）、`executeFrom`。
- Produces:
  - `createRun(deps: EngineDeps, workflow: Workflow, inputs: Record<string,string>, source: string): Run` — 只建立 `pending` run（缺 required input 擲錯），不執行。
  - `ResumePrep`：`{ run: Run; resume: boolean; workflow?: Workflow; fromIndex?: number }`
  - `prepareResume(deps: EngineDeps, runId: string, decision: { approve: boolean; note?: string }): ResumePrep` — 同步驗證 + 記錄決策；approve 回 `resume:true` 帶 workflow/fromIndex；reject 標 `rejected` 回 `resume:false`。找不到 run / 非 paused / 無待決 checkpoint 擲帶明確訊息的錯誤。

- [ ] **Step 1: 寫失敗測試**

Create `tests/engine/runner.nonblocking.test.ts`:

```ts
import { test, expect } from "bun:test";
import { openDb } from "../../src/store/db";
import { RunRepository } from "../../src/store/runs";
import { StepRepository } from "../../src/store/steps";
import { CheckpointRepository } from "../../src/store/checkpoints";
import { MockDriver } from "../../src/driver/mock";
import { createRun, prepareResume, executeFrom, type EngineDeps } from "../../src/engine/runner";
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

const reqWf = { name: "r", inputs: [{ name: "topic", required: true }], stages: [{ id: "a", agent: { prompt: "{{topic}}" } }] } as unknown as Workflow;

test("createRun 只建立 pending run 不執行", () => {
  const d = deps(new MockDriver([]));
  const run = createRun(d, wf, {}, yaml);
  expect(run.status).toBe("pending");
  expect(run.currentStageIndex).toBe(0);
  expect(d.steps.listByRun(run.id)).toHaveLength(0);
});

test("createRun 缺 required input 擲錯", () => {
  const d = deps(new MockDriver([]));
  expect(() => createRun(d, reqWf, {}, "x")).toThrow(/topic/);
});

test("prepareResume approve 回 resume:true 並帶 fromIndex", async () => {
  const d = deps(new MockDriver([{ output: "草稿內容" }]));
  const run = createRun(d, wf, {}, yaml);
  await executeFrom(d, run, wf, 0); // 跑到 checkpoint → paused
  const prep = prepareResume(d, run.id, { approve: true, note: "讚" });
  expect(prep.resume).toBe(true);
  expect(prep.fromIndex).toBe(1);
  expect(prep.workflow!.name).toBe("demo");
  expect(d.checkpoints.listByRun(run.id)[0].decision).toBe("approved");
  expect(d.checkpoints.listByRun(run.id)[0].note).toBe("讚");
});

test("prepareResume reject 標 rejected 回 resume:false", async () => {
  const d = deps(new MockDriver([{ output: "草稿內容" }]));
  const run = createRun(d, wf, {}, yaml);
  await executeFrom(d, run, wf, 0);
  const prep = prepareResume(d, run.id, { approve: false });
  expect(prep.resume).toBe(false);
  expect(prep.run.status).toBe("rejected");
});

test("prepareResume 找不到 run 擲錯", () => {
  expect(() => prepareResume(deps(new MockDriver([])), "nope", { approve: true })).toThrow(/找不到/);
});

test("prepareResume 非 paused 擲錯", () => {
  const d = deps(new MockDriver([]));
  const run = createRun(d, wf, {}, yaml); // pending
  expect(() => prepareResume(d, run.id, { approve: true })).toThrow(/paused/);
});
```

- [ ] **Step 2: 執行測試確認失敗**

Run: `bun test tests/engine/runner.nonblocking.test.ts`
Expected: FAIL —「Export named 'createRun' not found」。

- [ ] **Step 3: 實作 createRun 與 prepareResume**

在 `src/engine/runner.ts`，把 `startRun` 改為重用 `createRun`，並新增 `prepareResume`：

```ts
export function createRun(
  deps: EngineDeps,
  workflow: Workflow,
  inputs: Record<string, string>,
  source: string,
): Run {
  const context = resolveInputs(workflow, inputs); // 缺 required 在此擲錯
  return deps.runs.create({
    workflowName: workflow.name,
    workflowSnapshot: source,
    inputs: context,
    context,
    status: "pending",
    currentStageIndex: 0,
  });
}

export async function startRun(
  deps: EngineDeps,
  workflow: Workflow,
  inputs: Record<string, string>,
  source: string,
): Promise<Run> {
  const run = createRun(deps, workflow, inputs, source);
  return executeFrom(deps, run, workflow, 0);
}

export interface ResumePrep {
  run: Run;
  resume: boolean;
  workflow?: Workflow;
  fromIndex?: number;
}

export function prepareResume(
  deps: EngineDeps,
  runId: string,
  decision: { approve: boolean; note?: string },
): ResumePrep {
  const run = deps.runs.get(runId);
  if (!run) throw new Error(`找不到 run：${runId}`);
  if (run.status !== "paused") {
    throw new Error(`run ${runId} 狀態為 ${run.status}，非 paused，無法核可/駁回`);
  }
  const pending = deps.checkpoints.getPendingByRun(runId);
  if (!pending) throw new Error(`run ${runId} 沒有待決的 checkpoint`);

  if (!decision.approve) {
    deps.checkpoints.decide(pending.id, "rejected", decision.note);
    deps.runs.updateStatus(runId, "rejected");
    return { run: deps.runs.get(runId)!, resume: false };
  }

  deps.checkpoints.decide(pending.id, "approved", decision.note);
  const { workflow } = loadWorkflowFromString(run.workflowSnapshot);
  return { run, resume: true, workflow, fromIndex: run.currentStageIndex };
}
```

保留既有 `resumeRun`（CLI 用，行為不變）。

- [ ] **Step 4: 執行測試確認通過**

Run: `bun test tests/engine/runner.nonblocking.test.ts`
Expected: PASS（6 個測試）。

- [ ] **Step 5: 回歸全部引擎與 CLI 測試**

Run: `bun test tests/engine tests/cli`
Expected: 全數 PASS。

- [ ] **Step 6: Commit**

```bash
git add src/engine/runner.ts tests/engine/runner.nonblocking.test.ts
git commit -m "feat: [engine] split createRun/prepareResume for non-blocking API"
```

---

## Task 3: 事件匯流排（Event Bus）

**Files:**
- Create: `src/server/events/bus.ts`
- Test: `tests/server/bus.test.ts`

**Interfaces:**
- Produces:
  - `RunEvent`：`{ type: string; data: unknown }`
  - `EventBus` class：`subscribe(runId: string, listener: (e: RunEvent) => void): () => void`（回傳退訂函式）、`publish(runId: string, event: RunEvent): void`、`hasSubscribers(runId: string): boolean`

- [ ] **Step 1: 寫失敗測試**

Create `tests/server/bus.test.ts`:

```ts
import { test, expect } from "bun:test";
import { EventBus, type RunEvent } from "../../src/server/events/bus";

test("publish 送達該 run 的所有訂閱者", () => {
  const bus = new EventBus();
  const got: RunEvent[] = [];
  bus.subscribe("r1", (e) => got.push(e));
  bus.publish("r1", { type: "stage:start", data: { stageId: "a" } });
  expect(got).toHaveLength(1);
  expect(got[0].type).toBe("stage:start");
});

test("publish 不外洩到別的 run", () => {
  const bus = new EventBus();
  const got: RunEvent[] = [];
  bus.subscribe("r1", (e) => got.push(e));
  bus.publish("r2", { type: "x", data: null });
  expect(got).toHaveLength(0);
});

test("退訂後不再收到", () => {
  const bus = new EventBus();
  const got: RunEvent[] = [];
  const off = bus.subscribe("r1", (e) => got.push(e));
  off();
  bus.publish("r1", { type: "x", data: null });
  expect(got).toHaveLength(0);
  expect(bus.hasSubscribers("r1")).toBe(false);
});

test("一個 listener 擲錯不影響其他 listener", () => {
  const bus = new EventBus();
  const got: string[] = [];
  bus.subscribe("r1", () => { throw new Error("boom"); });
  bus.subscribe("r1", () => got.push("ok"));
  bus.publish("r1", { type: "x", data: null });
  expect(got).toEqual(["ok"]);
});
```

- [ ] **Step 2: 執行測試確認失敗**

Run: `bun test tests/server/bus.test.ts`
Expected: FAIL —「Cannot find module '../../src/server/events/bus'」。

- [ ] **Step 3: 實作 EventBus**

Create `src/server/events/bus.ts`:

```ts
export interface RunEvent {
  type: string;
  data: unknown;
}

type Listener = (event: RunEvent) => void;

export class EventBus {
  private listeners = new Map<string, Set<Listener>>();

  subscribe(runId: string, listener: Listener): () => void {
    let set = this.listeners.get(runId);
    if (!set) {
      set = new Set();
      this.listeners.set(runId, set);
    }
    set.add(listener);
    return () => {
      const s = this.listeners.get(runId);
      if (!s) return;
      s.delete(listener);
      if (s.size === 0) this.listeners.delete(runId);
    };
  }

  publish(runId: string, event: RunEvent): void {
    const set = this.listeners.get(runId);
    if (!set) return;
    for (const listener of [...set]) {
      try {
        listener(event);
      } catch (err) {
        console.error(`EventBus listener 擲錯（run ${runId}）：`, err);
      }
    }
  }

  hasSubscribers(runId: string): boolean {
    return this.listeners.has(runId);
  }
}
```

- [ ] **Step 4: 執行測試確認通過**

Run: `bun test tests/server/bus.test.ts`
Expected: PASS（4 個測試）。

- [ ] **Step 5: Commit**

```bash
git add src/server/events/bus.ts tests/server/bus.test.ts
git commit -m "feat: [server] add in-process per-run EventBus"
```

---

## Task 4: Request 驗證 schema

**Files:**
- Create: `src/server/validation.ts`
- Test: `tests/server/validation.test.ts`

**Interfaces:**
- Produces:
  - `CreateRunBody`：`{ workflow: string; inputs: Record<string,string> }`；`parseCreateRunBody(raw: unknown): CreateRunBody`（不合法擲 `ValidationError`）。
  - `DecisionBody`：`{ note?: string }`；`parseDecisionBody(raw: unknown): DecisionBody`。
  - `ValidationError extends Error`（供 handler 對應 400）。

- [ ] **Step 1: 寫失敗測試**

Create `tests/server/validation.test.ts`:

```ts
import { test, expect } from "bun:test";
import { parseCreateRunBody, parseDecisionBody, ValidationError } from "../../src/server/validation";

test("合法 create body 通過", () => {
  const body = parseCreateRunBody({ workflow: "write-blog-post", inputs: { topic: "Bun" } });
  expect(body.workflow).toBe("write-blog-post");
  expect(body.inputs.topic).toBe("Bun");
});

test("inputs 省略時預設空物件", () => {
  const body = parseCreateRunBody({ workflow: "wf" });
  expect(body.inputs).toEqual({});
});

test("缺 workflow 擲 ValidationError", () => {
  expect(() => parseCreateRunBody({ inputs: {} })).toThrow(ValidationError);
});

test("inputs 值非字串擲 ValidationError", () => {
  expect(() => parseCreateRunBody({ workflow: "wf", inputs: { a: 1 } })).toThrow(ValidationError);
});

test("decision body note 可選", () => {
  expect(parseDecisionBody({}).note).toBeUndefined();
  expect(parseDecisionBody({ note: "看起來不錯" }).note).toBe("看起來不錯");
});
```

- [ ] **Step 2: 執行測試確認失敗**

Run: `bun test tests/server/validation.test.ts`
Expected: FAIL —「Cannot find module '../../src/server/validation'」。

- [ ] **Step 3: 實作驗證**

Create `src/server/validation.ts`:

```ts
import { z } from "zod";

export class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ValidationError";
  }
}

const CreateRunSchema = z.object({
  workflow: z.string().min(1),
  inputs: z.record(z.string(), z.string()).default({}),
});

const DecisionSchema = z.object({
  note: z.string().optional(),
});

export type CreateRunBody = z.infer<typeof CreateRunSchema>;
export type DecisionBody = z.infer<typeof DecisionSchema>;

export function parseCreateRunBody(raw: unknown): CreateRunBody {
  const result = CreateRunSchema.safeParse(raw ?? {});
  if (!result.success) throw new ValidationError(`request body 不合法：${result.error.message}`);
  return result.data;
}

export function parseDecisionBody(raw: unknown): DecisionBody {
  const result = DecisionSchema.safeParse(raw ?? {});
  if (!result.success) throw new ValidationError(`request body 不合法：${result.error.message}`);
  return result.data;
}
```

- [ ] **Step 4: 執行測試確認通過**

Run: `bun test tests/server/validation.test.ts`
Expected: PASS（5 個測試）。

- [ ] **Step 5: Commit**

```bash
git add src/server/validation.ts tests/server/validation.test.ts
git commit -m "feat: [server] add zod request body validation"
```

---

## Task 5: Workflow 目錄掃描

**Files:**
- Create: `src/server/workflows.ts`
- Test: `tests/server/workflows.test.ts`

**Interfaces:**
- Consumes: `loadWorkflowFromString(text)`（`../schema/parse`）。
- Produces:
  - `WorkflowSummary`：`{ name: string; description?: string; inputs: { name: string; required: boolean; default?: string }[]; file: string }`
  - `listWorkflows(dir: string): Promise<WorkflowSummary[]>` — 掃 `dir` 下 `.yaml`/`.yml`，逐檔載入取摘要；載入失敗的檔跳過並 `console.error`，不整批失敗。依 name 排序。

- [ ] **Step 1: 寫失敗測試**

Create `tests/server/workflows.test.ts`:

```ts
import { test, expect, beforeAll, afterAll } from "bun:test";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { listWorkflows } from "../../src/server/workflows";

let dir: string;

beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), "aipipe-wf-"));
  await writeFile(join(dir, "b-flow.yaml"), `name: b-flow\ndescription: 乙\ninputs:\n  - name: topic\n    required: true\nstages:\n  - id: s\n    agent: { prompt: "{{topic}}" }\n`);
  await writeFile(join(dir, "a-flow.yml"), `name: a-flow\nstages:\n  - id: s\n    agent: { prompt: "hi" }\n`);
  await writeFile(join(dir, "broken.yaml"), `name: BROKEN UPPER\nstages: []\n`);
  await writeFile(join(dir, "notes.txt"), `忽略我`);
});

afterAll(async () => { await rm(dir, { recursive: true, force: true }); });

test("列出合法 workflow、依 name 排序、跳過壞檔與非 yaml", async () => {
  const list = await listWorkflows(dir);
  expect(list.map((w) => w.name)).toEqual(["a-flow", "b-flow"]);
});

test("摘要含 description 與 inputs", async () => {
  const list = await listWorkflows(dir);
  const b = list.find((w) => w.name === "b-flow")!;
  expect(b.description).toBe("乙");
  expect(b.inputs).toEqual([{ name: "topic", required: true, default: undefined }]);
});

test("目錄不存在回空陣列", async () => {
  expect(await listWorkflows(join(dir, "nope"))).toEqual([]);
});
```

- [ ] **Step 2: 執行測試確認失敗**

Run: `bun test tests/server/workflows.test.ts`
Expected: FAIL —「Cannot find module」。

- [ ] **Step 3: 實作掃描**

Create `src/server/workflows.ts`:

```ts
import { readdir } from "node:fs/promises";
import { join } from "node:path";
import { loadWorkflowFromString } from "../schema/parse";

export interface WorkflowSummary {
  name: string;
  description?: string;
  inputs: { name: string; required: boolean; default?: string }[];
  file: string;
}

export async function listWorkflows(dir: string): Promise<WorkflowSummary[]> {
  let entries: string[];
  try {
    entries = await readdir(dir);
  } catch {
    return [];
  }
  const yamlFiles = entries.filter((f) => f.endsWith(".yaml") || f.endsWith(".yml"));
  const summaries: WorkflowSummary[] = [];
  for (const file of yamlFiles) {
    const path = join(dir, file);
    try {
      const text = await Bun.file(path).text();
      const { workflow } = loadWorkflowFromString(text);
      summaries.push({
        name: workflow.name,
        description: workflow.description,
        inputs: workflow.inputs.map((i) => ({ name: i.name, required: i.required, default: i.default })),
        file,
      });
    } catch (err) {
      console.error(`跳過無法載入的 workflow「${file}」：`, err instanceof Error ? err.message : err);
    }
  }
  return summaries.sort((a, b) => a.name.localeCompare(b.name));
}
```

- [ ] **Step 4: 執行測試確認通過**

Run: `bun test tests/server/workflows.test.ts`
Expected: PASS（3 個測試）。

- [ ] **Step 5: Commit**

```bash
git add src/server/workflows.ts tests/server/workflows.test.ts
git commit -m "feat: [server] add workflow directory discovery"
```

---

## Task 6: 背景執行（observer→bus 綁定）

**Files:**
- Create: `src/server/background.ts`
- Test: `tests/server/background.test.ts`

**Interfaces:**
- Consumes: `EngineDeps`、`RunObserver`、`executeFrom`、`ResumePrep`（`../engine/runner`）；`EventBus`、`RunEvent`（`./events/bus`）；`Run`、`Workflow`。
- Produces:
  - `makeObserver(bus: EventBus, runId: string): RunObserver` — 各 callback 轉成 `bus.publish` 對應事件（`stage:start`/`stage:done`/`checkpoint`/`run:done`/`run:failed`）。
  - `startInBackground(deps: EngineDeps, bus: EventBus, run: Run, workflow: Workflow): Promise<void>` — 用綁定 observer 的 deps 跑 `executeFrom(...,0)`；意外例外發 `run:failed`。
  - `resumeInBackground(deps: EngineDeps, bus: EventBus, prep: ResumePrep): Promise<void>` — approve 時跑 `executeFrom(...,prep.fromIndex)`；reject 時發 `run:rejected` 事件。

**註（spec 精修）：** 事件集加入 `run:rejected`（`{}`），供 SSE 客戶端得知駁回終態；SSE 於 `run:done`/`run:failed`/`run:rejected` 關閉連線。

- [ ] **Step 1: 寫失敗測試**

Create `tests/server/background.test.ts`:

```ts
import { test, expect } from "bun:test";
import { openDb } from "../../src/store/db";
import { RunRepository } from "../../src/store/runs";
import { StepRepository } from "../../src/store/steps";
import { CheckpointRepository } from "../../src/store/checkpoints";
import { MockDriver } from "../../src/driver/mock";
import { createRun, prepareResume, executeFrom, type EngineDeps } from "../../src/engine/runner";
import { EventBus, type RunEvent } from "../../src/server/events/bus";
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

test("startInBackground 發出 stage 事件並在 checkpoint 停", async () => {
  const d = deps(new MockDriver([{ output: "草稿內容" }]));
  const bus = new EventBus();
  const events: RunEvent[] = [];
  const run = createRun(d, wf, {}, yaml);
  bus.subscribe(run.id, (e) => events.push(e));
  await startInBackground(d, bus, run, wf);
  const types = events.map((e) => e.type);
  expect(types).toEqual(["stage:start", "stage:done", "checkpoint"]);
  expect(d.runs.get(run.id)!.status).toBe("paused");
});

test("resumeInBackground approve 續跑至 run:done", async () => {
  const d = deps(new MockDriver([{ output: "草稿內容" }, { output: "最終稿" }]));
  const bus = new EventBus();
  const run = createRun(d, wf, {}, yaml);
  await executeFrom(d, run, wf, 0); // paused
  const events: RunEvent[] = [];
  bus.subscribe(run.id, (e) => events.push(e));
  const prep = prepareResume(d, run.id, { approve: true });
  await resumeInBackground(d, bus, prep);
  expect(events.map((e) => e.type)).toEqual(["stage:start", "stage:done", "run:done"]);
  expect(d.runs.get(run.id)!.status).toBe("completed");
});

test("resumeInBackground reject 發 run:rejected", async () => {
  const d = deps(new MockDriver([{ output: "草稿內容" }]));
  const bus = new EventBus();
  const run = createRun(d, wf, {}, yaml);
  await executeFrom(d, run, wf, 0);
  const events: RunEvent[] = [];
  bus.subscribe(run.id, (e) => events.push(e));
  const prep = prepareResume(d, run.id, { approve: false });
  await resumeInBackground(d, bus, prep);
  expect(events.map((e) => e.type)).toEqual(["run:rejected"]);
});
```

- [ ] **Step 2: 執行測試確認失敗**

Run: `bun test tests/server/background.test.ts`
Expected: FAIL —「Cannot find module '../../src/server/background'」。

- [ ] **Step 3: 實作背景執行**

Create `src/server/background.ts`:

```ts
import { executeFrom, type EngineDeps, type RunObserver, type ResumePrep } from "../engine/runner";
import type { Run } from "../store/runs";
import type { Workflow } from "../schema/workflow";
import type { EventBus } from "./events/bus";

export function makeObserver(bus: EventBus, runId: string): RunObserver {
  return {
    onStageStart: (e) => bus.publish(runId, { type: "stage:start", data: e }),
    onStageDone: (e) => bus.publish(runId, { type: "stage:done", data: e }),
    onCheckpoint: (e) => bus.publish(runId, { type: "checkpoint", data: e }),
    onRunDone: (e) => bus.publish(runId, { type: "run:done", data: e }),
    onRunFailed: (e) => bus.publish(runId, { type: "run:failed", data: e }),
  };
}

export async function startInBackground(
  deps: EngineDeps,
  bus: EventBus,
  run: Run,
  workflow: Workflow,
): Promise<void> {
  const boundDeps: EngineDeps = { ...deps, observer: makeObserver(bus, run.id) };
  try {
    await executeFrom(boundDeps, run, workflow, 0);
  } catch (err) {
    bus.publish(run.id, { type: "run:failed", data: { stageId: "", error: String(err) } });
    deps.runs.updateStatus(run.id, "failed");
  }
}

export async function resumeInBackground(
  deps: EngineDeps,
  bus: EventBus,
  prep: ResumePrep,
): Promise<void> {
  if (!prep.resume) {
    bus.publish(prep.run.id, { type: "run:rejected", data: {} });
    return;
  }
  const boundDeps: EngineDeps = { ...deps, observer: makeObserver(bus, prep.run.id) };
  try {
    await executeFrom(boundDeps, prep.run, prep.workflow!, prep.fromIndex!);
  } catch (err) {
    bus.publish(prep.run.id, { type: "run:failed", data: { stageId: "", error: String(err) } });
    deps.runs.updateStatus(prep.run.id, "failed");
  }
}
```

- [ ] **Step 4: 執行測試確認通過**

Run: `bun test tests/server/background.test.ts`
Expected: PASS（3 個測試）。

- [ ] **Step 5: Commit**

```bash
git add src/server/background.ts tests/server/background.test.ts
git commit -m "feat: [server] add background run execution bound to EventBus"
```

---

## Task 7: 路由 handler（純函式）

**Files:**
- Create: `src/server/handlers.ts`
- Test: `tests/server/handlers.test.ts`

**Interfaces:**
- Consumes: `createRun`、`prepareResume`、`type EngineDeps`（`../engine/runner`）；`startInBackground`、`resumeInBackground`（`./background`）；`EventBus`；`listWorkflows`；`parseCreateRunBody`、`parseDecisionBody`、`ValidationError`；`loadWorkflowFromString`。
- Produces（皆回 `ApiResult = { status: number; body: { success: boolean; data?: unknown; error?: string } }`）：
  - `listWorkflowsHandler(dir: string): Promise<ApiResult>`
  - `createRunHandler(deps: EngineDeps, bus: EventBus, dir: string, rawBody: unknown): Promise<ApiResult>` — 驗證 body → 讀該 workflow 檔 → `createRun` → `startInBackground`（不 await）→ 201 `{ runId, status }`。找不到 workflow 檔 → 404；缺 required input（引擎擲錯）→ 400。
  - `listRunsHandler(deps: EngineDeps): ApiResult`
  - `getRunHandler(deps: EngineDeps, id: string): ApiResult` — 含 `steps`、`checkpoints`；找不到 → 404。
  - `decisionHandler(deps: EngineDeps, bus: EventBus, id: string, approve: boolean, rawBody: unknown): ApiResult` — `prepareResume` → `resumeInBackground`（不 await）→ 200 run。找不到 → 404；非 paused/無 checkpoint → 409。

- [ ] **Step 1: 寫失敗測試**

Create `tests/server/handlers.test.ts`:

```ts
import { test, expect, beforeAll, afterAll } from "bun:test";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { openDb } from "../../src/store/db";
import { RunRepository } from "../../src/store/runs";
import { StepRepository } from "../../src/store/steps";
import { CheckpointRepository } from "../../src/store/checkpoints";
import { MockDriver } from "../../src/driver/mock";
import { createRun, executeFrom, type EngineDeps } from "../../src/engine/runner";
import { EventBus } from "../../src/server/events/bus";
import {
  listWorkflowsHandler, createRunHandler, listRunsHandler, getRunHandler, decisionHandler,
} from "../../src/server/handlers";
import type { Workflow } from "../../src/schema/workflow";

let dir: string;
const cpYaml = `name: cp-flow\ninputs: []\nstages:\n  - id: draft\n    agent: { prompt: "寫草稿" }\n    output: draft\n    checkpoint: { prompt: "OK 嗎？" }\n  - id: publish\n    agent: { prompt: "發佈 {{draft}}" }\n    output: final\n`;
const cpWf = { name: "cp-flow", inputs: [], stages: [
  { id: "draft", agent: { prompt: "寫草稿" }, output: "draft", checkpoint: { prompt: "OK 嗎？" } },
  { id: "publish", agent: { prompt: "發佈 {{draft}}" }, output: "final" },
] } as unknown as Workflow;

beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), "aipipe-h-"));
  await writeFile(join(dir, "cp-flow.yaml"), cpYaml);
});
afterAll(async () => { await rm(dir, { recursive: true, force: true }); });

function deps(driver: MockDriver): EngineDeps {
  const db = openDb(":memory:");
  return { runs: new RunRepository(db), steps: new StepRepository(db), checkpoints: new CheckpointRepository(db), driver };
}

test("listWorkflowsHandler 回 200 與清單", async () => {
  const res = await listWorkflowsHandler(dir);
  expect(res.status).toBe(200);
  expect((res.body.data as any[]).map((w) => w.name)).toEqual(["cp-flow"]);
});

test("createRunHandler 回 201 與 runId，run 落地", async () => {
  const d = deps(new MockDriver([{ output: "草稿內容" }]));
  const res = await createRunHandler(d, new EventBus(), dir, { workflow: "cp-flow", inputs: {} });
  expect(res.status).toBe(201);
  const runId = (res.body.data as any).runId as string;
  expect(d.runs.get(runId)).not.toBeNull();
});

test("createRunHandler 找不到 workflow 回 404", async () => {
  const res = await createRunHandler(deps(new MockDriver([])), new EventBus(), dir, { workflow: "nope", inputs: {} });
  expect(res.status).toBe(404);
  expect(res.body.success).toBe(false);
});

test("createRunHandler body 不合法回 400", async () => {
  const res = await createRunHandler(deps(new MockDriver([])), new EventBus(), dir, { inputs: {} });
  expect(res.status).toBe(400);
});

test("getRunHandler 含 steps 與 checkpoints", async () => {
  const d = deps(new MockDriver([{ output: "草稿內容" }]));
  const run = createRun(d, cpWf, {}, cpYaml);
  await executeFrom(d, run, cpWf, 0);
  const res = getRunHandler(d, run.id);
  expect(res.status).toBe(200);
  const data = res.body.data as any;
  expect(data.run.id).toBe(run.id);
  expect(data.steps).toHaveLength(1);
  expect(data.checkpoints).toHaveLength(1);
});

test("getRunHandler 找不到回 404", () => {
  expect(getRunHandler(deps(new MockDriver([])), "nope").status).toBe(404);
});

test("decisionHandler approve 回 200", async () => {
  const d = deps(new MockDriver([{ output: "草稿內容" }, { output: "最終稿" }]));
  const run = createRun(d, cpWf, {}, cpYaml);
  await executeFrom(d, run, cpWf, 0);
  const res = decisionHandler(d, new EventBus(), run.id, true, { note: "讚" });
  expect(res.status).toBe(200);
});

test("decisionHandler 非 paused 回 409", () => {
  const d = deps(new MockDriver([]));
  const run = createRun(d, cpWf, {}, cpYaml); // pending
  expect(decisionHandler(d, new EventBus(), run.id, true, {}).status).toBe(409);
});

test("decisionHandler 找不到 run 回 404", () => {
  expect(decisionHandler(deps(new MockDriver([])), new EventBus(), "nope", true, {}).status).toBe(404);
});
```

- [ ] **Step 2: 執行測試確認失敗**

Run: `bun test tests/server/handlers.test.ts`
Expected: FAIL —「Cannot find module '../../src/server/handlers'」。

- [ ] **Step 3: 實作 handlers**

Create `src/server/handlers.ts`:

```ts
import { join } from "node:path";
import { createRun, prepareResume, type EngineDeps } from "../engine/runner";
import { loadWorkflowFromString } from "../schema/parse";
import { startInBackground, resumeInBackground } from "./background";
import type { EventBus } from "./events/bus";
import { listWorkflows } from "./workflows";
import { parseCreateRunBody, parseDecisionBody, ValidationError } from "./validation";

export interface ApiResult {
  status: number;
  body: { success: boolean; data?: unknown; error?: string };
}

const ok = (data: unknown, status = 200): ApiResult => ({ status, body: { success: true, data } });
const err = (status: number, message: string): ApiResult => ({ status, body: { success: false, error: message } });

export async function listWorkflowsHandler(dir: string): Promise<ApiResult> {
  return ok(await listWorkflows(dir));
}

export async function createRunHandler(
  deps: EngineDeps,
  bus: EventBus,
  dir: string,
  rawBody: unknown,
): Promise<ApiResult> {
  let body;
  try {
    body = parseCreateRunBody(rawBody);
  } catch (e) {
    if (e instanceof ValidationError) return err(400, e.message);
    throw e;
  }
  let text: string;
  try {
    text = await Bun.file(join(dir, `${body.workflow}.yaml`)).text();
  } catch {
    return err(404, `找不到 workflow：${body.workflow}`);
  }
  let run;
  try {
    const { workflow } = loadWorkflowFromString(text);
    run = createRun(deps, workflow, body.inputs, text);
    void startInBackground(deps, bus, run, workflow);
  } catch (e) {
    return err(400, e instanceof Error ? e.message : String(e));
  }
  return ok({ runId: run.id, status: run.status }, 201);
}

export function listRunsHandler(deps: EngineDeps): ApiResult {
  return ok(deps.runs.list());
}

export function getRunHandler(deps: EngineDeps, id: string): ApiResult {
  const run = deps.runs.get(id);
  if (!run) return err(404, `找不到 run：${id}`);
  return ok({ run, steps: deps.steps.listByRun(id), checkpoints: deps.checkpoints.listByRun(id) });
}

export function decisionHandler(
  deps: EngineDeps,
  bus: EventBus,
  id: string,
  approve: boolean,
  rawBody: unknown,
): ApiResult {
  let body;
  try {
    body = parseDecisionBody(rawBody);
  } catch (e) {
    if (e instanceof ValidationError) return err(400, e.message);
    throw e;
  }
  let prep;
  try {
    prep = prepareResume(deps, id, { approve, note: body.note });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg.includes("找不到")) return err(404, msg);
    return err(409, msg);
  }
  void resumeInBackground(deps, bus, prep);
  return ok(prep.run);
}
```

- [ ] **Step 4: 執行測試確認通過**

Run: `bun test tests/server/handlers.test.ts`
Expected: PASS（9 個測試）。

- [ ] **Step 5: Commit**

```bash
git add src/server/handlers.ts tests/server/handlers.test.ts
git commit -m "feat: [server] add pure route handlers"
```

---

## Task 8: SSE Response 產生器

**Files:**
- Create: `src/server/sse.ts`
- Test: `tests/server/sse.test.ts`

**Interfaces:**
- Consumes: `EngineDeps`、`EventBus`、`RunEvent`。
- Produces:
  - `sseResponse(deps: EngineDeps, bus: EventBus, runId: string, opts?: { heartbeatMs?: number }): Response` — 立即送 `snapshot` 事件（run+steps+checkpoints；找不到 run 則 snapshot.data.run=null），訂閱 bus 續推；收到 `run:done`/`run:failed`/`run:rejected` 後關閉；定期送 `ping`。
  - `formatSse(event: RunEvent): string` — 轉成 `event: <type>\ndata: <json>\n\n`。

**測試策略：** `formatSse` 直接單元測試；串流行為用 `ReadableStream` 讀取器 + `bus.publish` 驗證。

- [ ] **Step 1: 寫失敗測試**

Create `tests/server/sse.test.ts`:

```ts
import { test, expect } from "bun:test";
import { openDb } from "../../src/store/db";
import { RunRepository } from "../../src/store/runs";
import { StepRepository } from "../../src/store/steps";
import { CheckpointRepository } from "../../src/store/checkpoints";
import { MockDriver } from "../../src/driver/mock";
import { createRun, type EngineDeps } from "../../src/engine/runner";
import { EventBus } from "../../src/server/events/bus";
import { formatSse, sseResponse } from "../../src/server/sse";
import type { Workflow } from "../../src/schema/workflow";

test("formatSse 產生正確 SSE 幀", () => {
  expect(formatSse({ type: "ping", data: {} })).toBe("event: ping\ndata: {}\n\n");
});

const wf = { name: "d", inputs: [], stages: [{ id: "a", agent: { prompt: "x" }, output: "o" }] } as unknown as Workflow;
function deps(): EngineDeps {
  const db = openDb(":memory:");
  return { runs: new RunRepository(db), steps: new StepRepository(db), checkpoints: new CheckpointRepository(db), driver: new MockDriver([]) };
}

async function readEvents(res: Response, until: (text: string) => boolean): Promise<string> {
  const reader = res.body!.getReader();
  const decoder = new TextDecoder();
  let text = "";
  while (!until(text)) {
    const { value, done } = await reader.read();
    if (done) break;
    text += decoder.decode(value);
  }
  await reader.cancel();
  return text;
}

test("連線立即送 snapshot，之後推 bus 事件並於終態關閉", async () => {
  const d = deps();
  const bus = new EventBus();
  const run = createRun(d, wf, {}, "name: d\ninputs: []\nstages:\n  - id: a\n    agent: { prompt: x }\n    output: o");
  const res = sseResponse(d, bus, run.id, { heartbeatMs: 10_000 });
  // 在下一個 microtask 推事件
  queueMicrotask(() => {
    bus.publish(run.id, { type: "stage:start", data: { stageId: "a" } });
    bus.publish(run.id, { type: "run:done", data: { status: "completed" } });
  });
  const text = await readEvents(res, (t) => t.includes("run:done"));
  expect(text).toContain("event: snapshot");
  expect(text).toContain("event: stage:start");
  expect(text).toContain("event: run:done");
});
```

- [ ] **Step 2: 執行測試確認失敗**

Run: `bun test tests/server/sse.test.ts`
Expected: FAIL —「Cannot find module '../../src/server/sse'」。

- [ ] **Step 3: 實作 SSE**

Create `src/server/sse.ts`:

```ts
import type { EngineDeps } from "../engine/runner";
import type { EventBus, RunEvent } from "./events/bus";

const TERMINAL = new Set(["run:done", "run:failed", "run:rejected"]);

export function formatSse(event: RunEvent): string {
  return `event: ${event.type}\ndata: ${JSON.stringify(event.data)}\n\n`;
}

export function sseResponse(
  deps: EngineDeps,
  bus: EventBus,
  runId: string,
  opts: { heartbeatMs?: number } = {},
): Response {
  const heartbeatMs = opts.heartbeatMs ?? 15_000;
  const encoder = new TextEncoder();

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      let closed = false;
      const send = (event: RunEvent) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(formatSse(event)));
        } catch {
          /* 連線已關 */
        }
      };
      const close = () => {
        if (closed) return;
        closed = true;
        clearInterval(timer);
        unsub();
        try { controller.close(); } catch { /* 已關 */ }
      };

      // 先訂閱再讀快照（同一同步區塊，不漏事件）
      const unsub = bus.subscribe(runId, (event) => {
        send(event);
        if (TERMINAL.has(event.type)) close();
      });

      const run = deps.runs.get(runId);
      send({
        type: "snapshot",
        data: run
          ? { run, steps: deps.steps.listByRun(runId), checkpoints: deps.checkpoints.listByRun(runId) }
          : { run: null },
      });

      const timer = setInterval(() => send({ type: "ping", data: {} }), heartbeatMs);
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
```

- [ ] **Step 4: 執行測試確認通過**

Run: `bun test tests/server/sse.test.ts`
Expected: PASS（2 個測試）。

- [ ] **Step 5: Commit**

```bash
git add src/server/sse.ts tests/server/sse.test.ts
git commit -m "feat: [server] add SSE response generator"
```

---

## Task 9: 伺服器組裝（Bun.serve 路由 + 靜態檔）

**Files:**
- Create: `src/server/index.ts`
- Modify: `package.json:7-10`（加 `server` script）
- Test: `tests/server/integration.test.ts`

**Interfaces:**
- Consumes: `buildDeps`（`../cli/deps`）、全部 handler、`sseResponse`、`EventBus`、`MockDriver`。
- Produces:
  - `createServer(opts: { deps: EngineDeps; bus: EventBus; workflowsDir: string; staticDir?: string; port: number }): Server` — 回 Bun `Server`。
  - `main(): void` — 讀環境變數組 prod 依賴後 `createServer`；`AIPIPE_MOCK=1` 時用 `MockDriver`（回聲模擬），供 E2E。

- [ ] **Step 1: 寫失敗測試**

Create `tests/server/integration.test.ts`:

```ts
import { test, expect, beforeAll, afterAll } from "bun:test";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { openDb } from "../../src/store/db";
import { RunRepository } from "../../src/store/runs";
import { StepRepository } from "../../src/store/steps";
import { CheckpointRepository } from "../../src/store/checkpoints";
import { MockDriver } from "../../src/driver/mock";
import type { EngineDeps } from "../../src/engine/runner";
import { EventBus } from "../../src/server/events/bus";
import { createServer } from "../../src/server/index";

let dir: string;
let server: ReturnType<typeof createServer>;
let base: string;

beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), "aipipe-int-"));
  await writeFile(join(dir, "cp-flow.yaml"),
    `name: cp-flow\ninputs: []\nstages:\n  - id: draft\n    agent: { prompt: "寫草稿" }\n    output: draft\n    checkpoint: { prompt: "OK 嗎？" }\n  - id: publish\n    agent: { prompt: "發佈 {{draft}}" }\n    output: final\n`);
  const db = openDb(":memory:");
  const deps: EngineDeps = {
    runs: new RunRepository(db), steps: new StepRepository(db), checkpoints: new CheckpointRepository(db),
    driver: new MockDriver(() => ({ output: "（模擬輸出）" })),
  };
  server = createServer({ deps, bus: new EventBus(), workflowsDir: dir, port: 0 });
  base = `http://localhost:${server.port}`;
});
afterAll(async () => { server.stop(true); await rm(dir, { recursive: true, force: true }); });

test("GET /api/workflows 回清單", async () => {
  const res = await fetch(`${base}/api/workflows`);
  expect(res.status).toBe(200);
  const json = await res.json();
  expect(json.data[0].name).toBe("cp-flow");
});

test("POST /api/runs → SSE 收到事件 → approve → 完成", async () => {
  const create = await fetch(`${base}/api/runs`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ workflow: "cp-flow", inputs: {} }),
  });
  expect(create.status).toBe(201);
  const { data } = await create.json();
  const runId = data.runId as string;

  // 開 SSE，等到 checkpoint 事件
  const es = await fetch(`${base}/api/events/${runId}`);
  const reader = es.body!.getReader();
  const dec = new TextDecoder();
  let buf = "";
  while (!buf.includes("event: checkpoint")) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += dec.decode(value);
  }
  expect(buf).toContain("event: snapshot");
  expect(buf).toContain("event: stage:start");
  await reader.cancel();

  const approve = await fetch(`${base}/api/runs/${runId}/approve`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: "{}",
  });
  expect(approve.status).toBe(200);

  // 輪詢直到 completed
  let status = "";
  for (let i = 0; i < 50 && status !== "completed"; i++) {
    const r = await fetch(`${base}/api/runs/${runId}`);
    status = (await r.json()).data.run.status;
    if (status !== "completed") await Bun.sleep(20);
  }
  expect(status).toBe("completed");
});

test("POST /api/runs 找不到 workflow 回 404", async () => {
  const res = await fetch(`${base}/api/runs`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ workflow: "nope" }),
  });
  expect(res.status).toBe(404);
});
```

- [ ] **Step 2: 執行測試確認失敗**

Run: `bun test tests/server/integration.test.ts`
Expected: FAIL —「Cannot find module '../../src/server/index'」。

- [ ] **Step 3: 實作伺服器**

Create `src/server/index.ts`:

```ts
import type { Server } from "bun";
import type { EngineDeps } from "../engine/runner";
import { EventBus } from "./events/bus";
import { buildDeps } from "../cli/deps";
import { MockDriver } from "../driver/mock";
import {
  listWorkflowsHandler, createRunHandler, listRunsHandler, getRunHandler, decisionHandler, type ApiResult,
} from "./handlers";
import { sseResponse } from "./sse";

const json = (r: ApiResult): Response =>
  new Response(JSON.stringify(r.body), { status: r.status, headers: { "Content-Type": "application/json" } });

export interface ServerOptions {
  deps: EngineDeps;
  bus: EventBus;
  workflowsDir: string;
  staticDir?: string;
  port: number;
}

export function createServer(opts: ServerOptions): Server {
  const { deps, bus, workflowsDir, staticDir } = opts;

  return Bun.serve({
    port: opts.port,
    async fetch(req) {
      const url = new URL(req.url);
      const path = url.pathname;
      const method = req.method;

      // ---- API ----
      if (path === "/api/workflows" && method === "GET") {
        return json(await listWorkflowsHandler(workflowsDir));
      }
      if (path === "/api/runs" && method === "GET") {
        return json(listRunsHandler(deps));
      }
      if (path === "/api/runs" && method === "POST") {
        return json(await createRunHandler(deps, bus, workflowsDir, await safeJson(req)));
      }
      const runMatch = path.match(/^\/api\/runs\/([^/]+)$/);
      if (runMatch && method === "GET") {
        return json(getRunHandler(deps, decodeURIComponent(runMatch[1])));
      }
      const approveMatch = path.match(/^\/api\/runs\/([^/]+)\/approve$/);
      if (approveMatch && method === "POST") {
        return json(decisionHandler(deps, bus, decodeURIComponent(approveMatch[1]), true, await safeJson(req)));
      }
      const rejectMatch = path.match(/^\/api\/runs\/([^/]+)\/reject$/);
      if (rejectMatch && method === "POST") {
        return json(decisionHandler(deps, bus, decodeURIComponent(rejectMatch[1]), false, await safeJson(req)));
      }
      const eventsMatch = path.match(/^\/api\/events\/([^/]+)$/);
      if (eventsMatch && method === "GET") {
        return sseResponse(deps, bus, decodeURIComponent(eventsMatch[1]));
      }

      // ---- 靜態前端 ----
      if (staticDir && method === "GET") {
        const file = Bun.file(`${staticDir}${path === "/" ? "/index.html" : path}`);
        if (await file.exists()) return new Response(file);
        // SPA fallback
        const index = Bun.file(`${staticDir}/index.html`);
        if (await index.exists()) return new Response(index);
      }

      return new Response("Not Found", { status: 404 });
    },
  });
}

async function safeJson(req: Request): Promise<unknown> {
  try {
    return await req.json();
  } catch {
    return {};
  }
}

export function main(): void {
  const port = Number(process.env.AIPIPE_PORT ?? 3000);
  const workflowsDir = process.env.AIPIPE_WORKFLOWS ?? "./workflows";
  const staticDir = process.env.AIPIPE_STATIC ?? "./web/dist";
  const driver = process.env.AIPIPE_MOCK
    ? new MockDriver((input) => ({ output: `（模擬）${input.prompt.slice(0, 24)}` }))
    : undefined;
  const deps = buildDeps({ driver });
  const server = createServer({ deps, bus: new EventBus(), workflowsDir, staticDir, port });
  console.error(`AIPipe 大廳後端啟動：http://localhost:${server.port}`);
}

if (import.meta.main) main();
```

- [ ] **Step 4: 加 package.json script**

修改 `package.json` 的 `scripts`，加一行：

```json
  "scripts": {
    "test": "bun test",
    "cli": "bun run src/cli/index.ts",
    "server": "bun run src/server/index.ts"
  },
```

- [ ] **Step 5: 執行測試確認通過**

Run: `bun test tests/server/integration.test.ts`
Expected: PASS（3 個測試）。

- [ ] **Step 6: 全後端回歸**

Run: `bun test`
Expected: 全數 PASS（含子專案 1 既有測試）。

- [ ] **Step 7: Commit**

```bash
git add src/server/index.ts package.json tests/server/integration.test.ts
git commit -m "feat: [server] assemble Bun.serve router with SSE and static serving"
```

---

## Task 10: 前端骨架（Vite + React）

**Files:**
- Create: `web/package.json` · `web/vite.config.ts` · `web/tsconfig.json` · `web/index.html` · `web/test-setup.ts` · `web/bunfig.toml` · `web/src/main.tsx` · `web/src/App.tsx`
- Create: `web/.gitignore`
- Test: `web/tests/smoke.test.tsx`

**Interfaces:**
- Produces: 可 `vite build` 與 `vite dev` 的前端；`App` 元件（暫時只渲染標題）。

- [ ] **Step 1: 安裝前端依賴**

Run:
```bash
cd web && bun init -y >/dev/null 2>&1 || true
cd web && bun add react react-dom
cd web && bun add -d vite @vitejs/plugin-react typescript @types/react @types/react-dom @happy-dom/global-registrator @testing-library/react @testing-library/dom
```
Expected: `web/node_modules` 建立，`web/package.json` 有上述依賴。

- [ ] **Step 2: 寫設定與骨架檔**

Create `web/package.json`（覆寫 bun init 產物；保留其加的依賴版本）：

```json
{
  "name": "aipipe-web",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "preview": "vite preview",
    "test": "bun test"
  }
}
```
（依賴區塊維持 Step 1 `bun add` 寫入的內容，勿刪。）

Create `web/vite.config.ts`:

```ts
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      "/api": { target: "http://localhost:3000", changeOrigin: true },
    },
  },
  build: { outDir: "dist" },
});
```

Create `web/tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "jsx": "react-jsx",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "strict": true,
    "types": ["react", "react-dom", "bun"],
    "skipLibCheck": true,
    "noEmit": true
  },
  "include": ["src", "tests"]
}
```

Create `web/index.html`:

```html
<!doctype html>
<html lang="zh-Hant">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>勇者公會大廳 — AIPipe</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

Create `web/bunfig.toml`:

```toml
[test]
preload = ["./test-setup.ts"]
```

Create `web/test-setup.ts`:

```ts
import { GlobalRegistrator } from "@happy-dom/global-registrator";
GlobalRegistrator.register();
```

Create `web/.gitignore`:

```
node_modules/
dist/
```

Create `web/src/main.tsx`:

```tsx
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
```

Create `web/src/App.tsx`:

```tsx
export function App() {
  return <h1>勇者公會大廳</h1>;
}
```

- [ ] **Step 3: 寫 smoke 測試**

Create `web/tests/smoke.test.tsx`:

```tsx
import { test, expect } from "bun:test";
import { render, screen } from "@testing-library/react";
import { App } from "../src/App";

test("App 渲染大廳標題", () => {
  render(<App />);
  expect(screen.getByText("勇者公會大廳")).toBeDefined();
});
```

- [ ] **Step 4: 執行測試與建置確認通過**

Run: `cd web && bun test tests/smoke.test.tsx`
Expected: PASS。

Run: `cd web && bun run build`
Expected: 產出 `web/dist/index.html`，無錯誤。

- [ ] **Step 5: Commit**

```bash
git add web/package.json web/bun.lock web/vite.config.ts web/tsconfig.json web/index.html web/bunfig.toml web/test-setup.ts web/.gitignore web/src/main.tsx web/src/App.tsx web/tests/smoke.test.tsx
git commit -m "feat: [web] scaffold React + Vite frontend"
```

---

## Task 11: API client 與 SSE client

**Files:**
- Create: `web/src/api/client.ts` · `web/src/api/sse.ts`
- Create: `web/src/api/types.ts`
- Test: `web/tests/api/client.test.ts` · `web/tests/api/sse.test.ts`

**Interfaces:**
- Produces（`types.ts`）：`RunStatus`、`Run`、`StepRecord`、`CheckpointRecord`、`WorkflowSummary`、`RunDetail`（`{ run: Run; steps: StepRecord[]; checkpoints: CheckpointRecord[] }`）—— 與後端型別對齊。
- Produces（`client.ts`）：`api` 物件：`listWorkflows()`、`listRuns()`、`getRun(id)`、`createRun(workflow, inputs)`、`approve(id, note?)`、`reject(id, note?)`。每個回傳 `data`，失敗擲 `Error(envelope.error)`。
- Produces（`sse.ts`）：`subscribeRun(id: string, onEvent: (type: string, data: unknown) => void): () => void` — 包 `EventSource`，註冊所有已知事件型別 + `snapshot`/`ping`；回傳關閉函式。

- [ ] **Step 1: 寫失敗測試（client）**

Create `web/tests/api/client.test.ts`:

```ts
import { test, expect, afterEach } from "bun:test";
import { api } from "../../src/api/client";

const realFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = realFetch; });

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
```

- [ ] **Step 2: 執行確認失敗**

Run: `cd web && bun test tests/api/client.test.ts`
Expected: FAIL —「Cannot find module」。

- [ ] **Step 3: 實作 types 與 client**

Create `web/src/api/types.ts`:

```ts
export type RunStatus = "pending" | "running" | "paused" | "completed" | "rejected" | "failed";

export interface Run {
  id: string;
  workflowName: string;
  status: RunStatus;
  inputs: Record<string, string>;
  context: Record<string, string>;
  currentStageIndex: number;
  createdAt: string;
  updatedAt: string;
}
export interface StepRecord {
  id: string; runId: string; stageId: string; prompt: string;
  output: string | null; status: "running" | "completed" | "failed";
  error: string | null; startedAt: string; endedAt: string | null;
}
export interface CheckpointRecord {
  id: string; runId: string; stageId: string; prompt: string;
  decision: "pending" | "approved" | "rejected"; note: string | null; decidedAt: string | null;
}
export interface WorkflowSummary {
  name: string; description?: string;
  inputs: { name: string; required: boolean; default?: string }[]; file: string;
}
export interface RunDetail { run: Run; steps: StepRecord[]; checkpoints: CheckpointRecord[]; }
```

Create `web/src/api/client.ts`:

```ts
import type { Run, RunDetail, WorkflowSummary } from "./types";

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`/api${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
  });
  const envelope = (await res.json()) as { success: boolean; data?: T; error?: string };
  if (!envelope.success) throw new Error(envelope.error ?? `請求失敗（${res.status}）`);
  return envelope.data as T;
}

export const api = {
  listWorkflows: () => call<WorkflowSummary[]>("/workflows"),
  listRuns: () => call<Run[]>("/runs"),
  getRun: (id: string) => call<RunDetail>(`/runs/${encodeURIComponent(id)}`),
  createRun: (workflow: string, inputs: Record<string, string>) =>
    call<{ runId: string; status: string }>("/runs", { method: "POST", body: JSON.stringify({ workflow, inputs }) }),
  approve: (id: string, note?: string) =>
    call<Run>(`/runs/${encodeURIComponent(id)}/approve`, { method: "POST", body: JSON.stringify({ note }) }),
  reject: (id: string, note?: string) =>
    call<Run>(`/runs/${encodeURIComponent(id)}/reject`, { method: "POST", body: JSON.stringify({ note }) }),
};
```

- [ ] **Step 4: 執行 client 測試確認通過**

Run: `cd web && bun test tests/api/client.test.ts`
Expected: PASS（3 個測試）。

- [ ] **Step 5: 寫失敗測試（sse）**

Create `web/tests/api/sse.test.ts`:

```ts
import { test, expect, afterEach } from "bun:test";
import { subscribeRun } from "../../src/api/sse";

const KNOWN = ["snapshot", "stage:start", "stage:done", "checkpoint", "run:done", "run:failed", "run:rejected", "ping"];

class FakeEventSource {
  static last: FakeEventSource | null = null;
  listeners = new Map<string, (e: MessageEvent) => void>();
  closed = false;
  constructor(public url: string) { FakeEventSource.last = this; }
  addEventListener(type: string, cb: (e: MessageEvent) => void) { this.listeners.set(type, cb); }
  close() { this.closed = true; }
  emit(type: string, data: unknown) { this.listeners.get(type)?.({ data: JSON.stringify(data) } as MessageEvent); }
}

afterEach(() => { FakeEventSource.last = null; });

test("subscribeRun 註冊所有事件並轉發", () => {
  (globalThis as any).EventSource = FakeEventSource;
  const got: [string, unknown][] = [];
  const off = subscribeRun("r1", (type, data) => got.push([type, data]));
  const es = FakeEventSource.last!;
  for (const t of KNOWN) expect(es.listeners.has(t)).toBe(true);
  es.emit("stage:start", { stageId: "a" });
  expect(got).toEqual([["stage:start", { stageId: "a" }]]);
  off();
  expect(es.closed).toBe(true);
});
```

- [ ] **Step 6: 執行確認失敗**

Run: `cd web && bun test tests/api/sse.test.ts`
Expected: FAIL —「Cannot find module」。

- [ ] **Step 7: 實作 sse**

Create `web/src/api/sse.ts`:

```ts
const EVENT_TYPES = [
  "snapshot", "stage:start", "stage:done", "checkpoint",
  "run:done", "run:failed", "run:rejected", "ping",
];

export function subscribeRun(
  id: string,
  onEvent: (type: string, data: unknown) => void,
): () => void {
  const es = new EventSource(`/api/events/${encodeURIComponent(id)}`);
  for (const type of EVENT_TYPES) {
    es.addEventListener(type, (e) => {
      const data = (e as MessageEvent).data ? JSON.parse((e as MessageEvent).data) : {};
      onEvent(type, data);
    });
  }
  return () => es.close();
}
```

- [ ] **Step 8: 執行 sse 測試確認通過**

Run: `cd web && bun test tests/api/sse.test.ts`
Expected: PASS。

- [ ] **Step 9: Commit**

```bash
git add web/src/api web/tests/api
git commit -m "feat: [web] add API client and SSE subscription"
```

---

## Task 12: 素材設定與 CT 視窗主題

**Files:**
- Create: `web/src/assets/assets.config.ts` · `web/src/theme/ct-window.css` · `web/src/theme/scene.css`
- Test: `web/tests/assets/assets.config.test.ts`

**Interfaces:**
- Produces（`assets.config.ts`）：
  - `AssetKey`：`"scene-bg" | "npc-master" | "player" | "adventurer" | "portrait-master" | "portrait-hero"`
  - `assetPath(key: AssetKey): string | null` — 回設定的圖檔路徑；未設定回 `null`（前端據此走 CSS 佔位 fallback）。
  - `hasAsset(key: AssetKey): boolean`
  - 內部 `ASSETS: Record<AssetKey, string | null>`（初期全 `null`，使用者放素材後填路徑，如 `/assets/scene-bg.png`）。

- [ ] **Step 1: 寫失敗測試**

Create `web/tests/assets/assets.config.test.ts`:

```ts
import { test, expect } from "bun:test";
import { assetPath, hasAsset } from "../../src/assets/assets.config";

test("未設定素材時回 null 並 hasAsset=false", () => {
  expect(assetPath("scene-bg")).toBeNull();
  expect(hasAsset("scene-bg")).toBe(false);
});

test("所有 key 都可查詢不擲錯", () => {
  for (const k of ["scene-bg", "npc-master", "player", "adventurer", "portrait-master", "portrait-hero"] as const) {
    expect(() => hasAsset(k)).not.toThrow();
  }
});
```

- [ ] **Step 2: 執行確認失敗**

Run: `cd web && bun test tests/assets/assets.config.test.ts`
Expected: FAIL —「Cannot find module」。

- [ ] **Step 3: 實作 assets.config 與主題 CSS**

Create `web/src/assets/assets.config.ts`:

```ts
export type AssetKey =
  | "scene-bg" | "npc-master" | "player" | "adventurer"
  | "portrait-master" | "portrait-hero";

// 使用者生成像素素材後，把對應路徑填入（放在 web/public/assets/ 下，如 "/assets/scene-bg.png"）。
// 維持 null 時，前端自動 fallback 到 CSS 佔位樣式（見 scene.css 的 .slot）。
const ASSETS: Record<AssetKey, string | null> = {
  "scene-bg": null,
  "npc-master": null,
  "player": null,
  "adventurer": null,
  "portrait-master": null,
  "portrait-hero": null,
};

export function assetPath(key: AssetKey): string | null {
  return ASSETS[key];
}
export function hasAsset(key: AssetKey): boolean {
  return ASSETS[key] !== null;
}
```

Create `web/src/theme/ct-window.css`（CT 藍框皮膚，取自 brainstorm mockup 定案樣式）：

```css
:root {
  --ct-edge: #0b1a4a;
  --ct-frame: #bfe3ff;
  --ct-mid: #4f86e0;
  --ct-fill1: #3a63d8;
  --ct-fill2: #2246ad;
}
.ct-window {
  background: linear-gradient(180deg, var(--ct-fill1) 0%, #2f55c4 55%, var(--ct-fill2) 100%);
  border-radius: 14px;
  color: #fff;
  text-shadow: 1px 1px 0 var(--ct-edge);
  box-shadow:
    0 2px 0 rgba(0, 0, 0, 0.55),
    inset 0 0 0 2px var(--ct-edge),
    inset 0 0 0 4px var(--ct-frame),
    inset 0 0 0 6px var(--ct-mid);
  padding: 12px 16px;
  font-family: ui-monospace, "Courier New", monospace;
}
.ct-window h4 { margin: 0 0 6px; font-size: 13px; letter-spacing: 0.1em; color: #eaf4ff; }
.ct-cursor { color: #fff; text-shadow: 0 0 5px var(--ct-frame); }
.ct-hl { color: #bff4ff; }
.ct-who { color: #ffe27a; }
```

Create `web/src/theme/scene.css`（明亮暖色場景 + 素材插槽 fallback，取自定案 mockup）：

```css
.cabinet {
  font-family: ui-monospace, "Courier New", monospace;
  border: 4px solid #000; border-radius: 6px; overflow: hidden; position: relative;
  aspect-ratio: 4 / 3; image-rendering: pixelated;
  box-shadow: inset 0 0 0 2px #e6d9b0;
}
.field {
  position: absolute; inset: 0;
  background:
    radial-gradient(60% 46% at 50% 58%, rgba(255, 246, 214, 0.30), rgba(90, 66, 30, 0.20) 70%, rgba(50, 36, 14, 0.42)),
    radial-gradient(ellipse 11px 8px at 12px 9px, #cdb87f 52%, #a98d55 58%, #7c6436 63%, transparent 66%) 0 0/24px 18px,
    radial-gradient(ellipse 11px 8px at 12px 9px, #c2ac72 52%, #9c8149 58%, #6f5a2e 63%, transparent 66%) 12px 9px/24px 18px,
    #5c4a28;
}
.grove {
  position: absolute; top: 0; left: 0; right: 0; height: 33%;
  background:
    radial-gradient(circle 7px at 7px 6px, #7ed267 55%, #47a23c 60%, #2c7327 66%, transparent 70%) 0 0/16px 15px,
    radial-gradient(circle 8px at 8px 9px, #52ad42 52%, #2f7c2a 60%, #1c5a1a 66%, transparent 70%) 8px 8px/16px 15px,
    #26661f;
  border-bottom: 3px solid #123f10; box-shadow: inset 0 -5px 6px -2px #123f10;
}
.slot {
  border: 2px dashed #2a58c8; border-radius: 5px; color: #0d1c40;
  background:
    linear-gradient(160deg, rgba(255, 255, 255, 0.55), rgba(42, 88, 200, 0.10) 60%, rgba(0, 0, 0, 0.12)),
    repeating-linear-gradient(45deg, rgba(42, 88, 200, 0.10) 0 6px, transparent 6px 12px);
  box-shadow: 0 3px 3px -2px rgba(0, 0, 0, 0.45);
  display: flex; align-items: center; justify-content: center; text-align: center;
  font-size: 10px; line-height: 1.3; padding: 3px; text-shadow: 0 1px 0 rgba(255, 255, 255, 0.6);
}
.sprite-img { width: 100%; height: 100%; object-fit: contain; image-rendering: pixelated; }
```

- [ ] **Step 4: 執行測試確認通過**

Run: `cd web && bun test tests/assets/assets.config.test.ts`
Expected: PASS（2 個測試）。

- [ ] **Step 5: Commit**

```bash
git add web/src/assets web/src/theme web/tests/assets
git commit -m "feat: [web] add asset config and Chrono Trigger window theme"
```

---

## Task 13: 展示元件（Scene · HudBar · QuestMenu · DialogBox）

**Files:**
- Create: `web/src/components/Sprite.tsx` · `web/src/components/Scene.tsx` · `web/src/components/HudBar.tsx` · `web/src/components/QuestMenu.tsx` · `web/src/components/DialogBox.tsx`
- Test: `web/tests/components/QuestMenu.test.tsx` · `web/tests/components/DialogBox.test.tsx`

**Interfaces:**
- Consumes: `assetPath`、`AssetKey`；`Run`、`RunStatus`。
- Produces:
  - `Sprite({ assetKey, label, className })` — 有素材則 `<img>`，否則 `.slot` 佔位顯示 `label`。
  - `Scene({ children })` — `.cabinet` + `.field` + `.grove` 容器，內含背景插槽與 children（角色）。
  - `HudBar({ title })` — 玩家 HUD 列。
  - `QuestMenu({ runs, selectedId, onSelect })` — CT 藍框任務列表，`▶` 指向 selected，狀態徽章。
  - `DialogBox({ speaker, children })` — CT 藍框對話框。
  - `statusLabel(status: RunStatus): string`（QuestMenu 內部匯出）：`running→執行中`、`paused→待核可`、`completed→完成`、`rejected→駁回`、`failed→失敗`、`pending→準備中`。

- [ ] **Step 1: 寫失敗測試**

Create `web/tests/components/QuestMenu.test.tsx`:

```tsx
import { test, expect } from "bun:test";
import { render, screen } from "@testing-library/react";
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
  render(<QuestMenu runs={runs} selectedId="r1" onSelect={() => {}} />);
  expect(screen.getByText("write-blog-post")).toBeDefined();
  expect(screen.getByText("待核可")).toBeDefined();
});
```

Create `web/tests/components/DialogBox.test.tsx`:

```tsx
import { test, expect } from "bun:test";
import { render, screen } from "@testing-library/react";
import { DialogBox } from "../../src/components/DialogBox";

test("DialogBox 顯示說話者與內容", () => {
  render(<DialogBox speaker="公會主">是否核可發佈？</DialogBox>);
  expect(screen.getByText("公會主：")).toBeDefined();
  expect(screen.getByText("是否核可發佈？")).toBeDefined();
});
```

- [ ] **Step 2: 執行確認失敗**

Run: `cd web && bun test tests/components/QuestMenu.test.tsx tests/components/DialogBox.test.tsx`
Expected: FAIL —「Cannot find module」。

- [ ] **Step 3: 實作元件**

Create `web/src/components/Sprite.tsx`:

```tsx
import { assetPath, type AssetKey } from "../assets/assets.config";

export function Sprite({ assetKey, label, className }: { assetKey: AssetKey; label: string; className?: string }) {
  const src = assetPath(assetKey);
  if (src) return <div className={className}><img className="sprite-img" src={src} alt={label} /></div>;
  return <div className={`slot ${className ?? ""}`}>{label}</div>;
}
```

Create `web/src/components/Scene.tsx`:

```tsx
import type { ReactNode } from "react";
import { assetPath } from "../assets/assets.config";

export function Scene({ children }: { children: ReactNode }) {
  const bg = assetPath("scene-bg");
  return (
    <div className="cabinet">
      <div className="field" style={bg ? { backgroundImage: `url(${bg})`, backgroundSize: "cover" } : undefined}>
        {!bg && <div className="grove" />}
        {children}
      </div>
    </div>
  );
}
```

Create `web/src/components/HudBar.tsx`:

```tsx
export function HudBar({ title }: { title: string }) {
  return (
    <div className="ct-window" style={{ display: "flex", alignItems: "center", gap: 14, borderRadius: 8 }}>
      <span className="ct-who">{title}</span>
      <span className="ct-hl">指令：▶ 發任務　名冊　記錄</span>
    </div>
  );
}
```

Create `web/src/components/QuestMenu.tsx`:

```tsx
import type { Run, RunStatus } from "../api/types";

export function statusLabel(status: RunStatus): string {
  switch (status) {
    case "running": return "執行中";
    case "paused": return "待核可";
    case "completed": return "完成";
    case "rejected": return "駁回";
    case "failed": return "失敗";
    case "pending": return "準備中";
  }
}

export function QuestMenu({ runs, selectedId, onSelect }: {
  runs: Run[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  return (
    <div className="ct-window">
      <h4>任務佈告欄</h4>
      {runs.length === 0 && <div style={{ fontSize: 11 }}>（尚無任務，點「發任務」開始）</div>}
      {runs.map((run) => (
        <div
          key={run.id}
          onClick={() => onSelect(run.id)}
          style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, padding: "3px 2px", cursor: "pointer" }}
        >
          <span className="ct-cursor" style={{ width: 12, visibility: run.id === selectedId ? "visible" : "hidden" }}>▶</span>
          {run.workflowName}
          <span style={{ marginLeft: "auto", fontSize: 9 }}>{statusLabel(run.status)}</span>
        </div>
      ))}
    </div>
  );
}
```

Create `web/src/components/DialogBox.tsx`:

```tsx
import type { ReactNode } from "react";

export function DialogBox({ speaker, children }: { speaker?: string; children: ReactNode }) {
  return (
    <div className="ct-window" style={{ fontSize: 14, lineHeight: 1.7 }}>
      {speaker && <span className="ct-who">{speaker}：</span>}
      {children}
    </div>
  );
}
```

- [ ] **Step 4: 執行測試確認通過**

Run: `cd web && bun test tests/components`
Expected: PASS（4 個測試）。

- [ ] **Step 5: Commit**

```bash
git add web/src/components/Sprite.tsx web/src/components/Scene.tsx web/src/components/HudBar.tsx web/src/components/QuestMenu.tsx web/src/components/DialogBox.tsx web/tests/components
git commit -m "feat: [web] add presentational hall components"
```

---

## Task 14: 互動元件與 hooks（NewQuestForm · CheckpointPrompt · useRun · useRunEvents）

**Files:**
- Create: `web/src/components/NewQuestForm.tsx` · `web/src/components/CheckpointPrompt.tsx`
- Create: `web/src/hooks/useRun.ts` · `web/src/hooks/useRunEvents.ts`
- Test: `web/tests/components/NewQuestForm.test.tsx` · `web/tests/components/CheckpointPrompt.test.tsx`

**Interfaces:**
- Consumes: `api`、`WorkflowSummary`、`RunDetail`、`CheckpointRecord`、`subscribeRun`。
- Produces:
  - `NewQuestForm({ workflows, onCreated })` — 選 workflow、依 `inputs` 動態渲染輸入框、送出呼叫 `api.createRun`，成功呼叫 `onCreated(runId)`。
  - `CheckpointPrompt({ checkpoint, onDecided })` — 顯示 checkpoint prompt 與「▶ 核可 / 駁回」，呼叫 `api.approve`/`api.reject` 後 `onDecided()`。
  - `useRun(id: string | null): { detail: RunDetail | null; reload: () => void }` — 載入 run 細節。
  - `useRunEvents(id, onEvent)` — 在 id 變動時訂閱 SSE，卸載時退訂。

- [ ] **Step 1: 寫失敗測試**

Create `web/tests/components/CheckpointPrompt.test.tsx`:

```tsx
import { test, expect, afterEach } from "bun:test";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { CheckpointPrompt } from "../../src/components/CheckpointPrompt";
import type { CheckpointRecord } from "../../src/api/types";

const realFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = realFetch; });

const cp = { id: "c1", runId: "r1", stageId: "draft", prompt: "OK 嗎？", decision: "pending", note: null, decidedAt: null } as CheckpointRecord;

test("點核可呼叫 approve 並回呼 onDecided", async () => {
  let called = false;
  globalThis.fetch = (async () => new Response(JSON.stringify({ success: true, data: { id: "r1", status: "running" } }), { status: 200 })) as typeof fetch;
  render(<CheckpointPrompt runId="r1" checkpoint={cp} onDecided={() => { called = true; }} />);
  expect(screen.getByText("OK 嗎？")).toBeDefined();
  fireEvent.click(screen.getByText("▶ 核可"));
  await waitFor(() => expect(called).toBe(true));
});
```

Create `web/tests/components/NewQuestForm.test.tsx`:

```tsx
import { test, expect, afterEach } from "bun:test";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { NewQuestForm } from "../../src/components/NewQuestForm";
import type { WorkflowSummary } from "../../src/api/types";

const realFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = realFetch; });

const workflows: WorkflowSummary[] = [
  { name: "write-blog-post", inputs: [{ name: "topic", required: true }], file: "write-blog-post.yaml" },
];

test("送出表單呼叫 createRun 並回呼 onCreated", async () => {
  let createdId = "";
  globalThis.fetch = (async () => new Response(JSON.stringify({ success: true, data: { runId: "r9", status: "pending" } }), { status: 201 })) as typeof fetch;
  render(<NewQuestForm workflows={workflows} onCreated={(id) => { createdId = id; }} />);
  fireEvent.change(screen.getByLabelText("topic"), { target: { value: "Bun" } });
  fireEvent.click(screen.getByText("發佈任務"));
  await waitFor(() => expect(createdId).toBe("r9"));
});
```

- [ ] **Step 2: 執行確認失敗**

Run: `cd web && bun test tests/components/NewQuestForm.test.tsx tests/components/CheckpointPrompt.test.tsx`
Expected: FAIL —「Cannot find module」。

- [ ] **Step 3: 實作 hooks**

Create `web/src/hooks/useRun.ts`:

```ts
import { useCallback, useEffect, useState } from "react";
import { api } from "../api/client";
import type { RunDetail } from "../api/types";

export function useRun(id: string | null): { detail: RunDetail | null; reload: () => void } {
  const [detail, setDetail] = useState<RunDetail | null>(null);

  const reload = useCallback(() => {
    if (!id) { setDetail(null); return; }
    api.getRun(id).then(setDetail).catch((e) => console.error("載入 run 失敗：", e));
  }, [id]);

  useEffect(() => { reload(); }, [reload]);
  return { detail, reload };
}
```

Create `web/src/hooks/useRunEvents.ts`:

```ts
import { useEffect } from "react";
import { subscribeRun } from "../api/sse";

export function useRunEvents(id: string | null, onEvent: (type: string, data: unknown) => void): void {
  useEffect(() => {
    if (!id) return;
    const off = subscribeRun(id, onEvent);
    return off;
  }, [id, onEvent]);
}
```

- [ ] **Step 4: 實作互動元件**

Create `web/src/components/CheckpointPrompt.tsx`:

```tsx
import { useState } from "react";
import { api } from "../api/client";
import type { CheckpointRecord } from "../api/types";
import { DialogBox } from "./DialogBox";

export function CheckpointPrompt({ runId, checkpoint, onDecided }: {
  runId: string;
  checkpoint: CheckpointRecord;
  onDecided: () => void;
}) {
  const [busy, setBusy] = useState(false);

  const decide = async (approve: boolean) => {
    setBusy(true);
    try {
      if (approve) await api.approve(runId);
      else await api.reject(runId);
      onDecided();
    } catch (e) {
      console.error("決策失敗：", e);
    } finally {
      setBusy(false);
    }
  };

  return (
    <DialogBox speaker="公會主">
      {checkpoint.prompt}
      <div style={{ marginTop: 8 }}>
        <button disabled={busy} onClick={() => decide(true)} className="ct-hl" style={{ background: "none", border: "none", cursor: "pointer", font: "inherit", color: "#bff4ff" }}>▶ 核可</button>
        <button disabled={busy} onClick={() => decide(false)} style={{ background: "none", border: "none", cursor: "pointer", font: "inherit", color: "#fff", marginLeft: 16 }}>駁回</button>
      </div>
    </DialogBox>
  );
}
```

Create `web/src/components/NewQuestForm.tsx`:

```tsx
import { useState } from "react";
import { api } from "../api/client";
import type { WorkflowSummary } from "../api/types";

export function NewQuestForm({ workflows, onCreated }: {
  workflows: WorkflowSummary[];
  onCreated: (runId: string) => void;
}) {
  const [selected, setSelected] = useState(workflows[0]?.name ?? "");
  const [inputs, setInputs] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const wf = workflows.find((w) => w.name === selected);

  const submit = async () => {
    setBusy(true);
    try {
      const { runId } = await api.createRun(selected, inputs);
      onCreated(runId);
    } catch (e) {
      console.error("發任務失敗：", e);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="ct-window">
      <h4>發佈新任務</h4>
      <select value={selected} onChange={(e) => { setSelected(e.target.value); setInputs({}); }}>
        {workflows.map((w) => <option key={w.name} value={w.name}>{w.name}</option>)}
      </select>
      {wf?.inputs.map((inp) => (
        <div key={inp.name} style={{ marginTop: 6 }}>
          <label htmlFor={inp.name} style={{ fontSize: 11 }}>{inp.name}{inp.required ? " *" : ""}</label>
          <input
            id={inp.name}
            aria-label={inp.name}
            value={inputs[inp.name] ?? ""}
            onChange={(e) => setInputs((p) => ({ ...p, [inp.name]: e.target.value }))}
          />
        </div>
      ))}
      <button disabled={busy || !selected} onClick={submit} style={{ marginTop: 8 }}>發佈任務</button>
    </div>
  );
}
```

- [ ] **Step 5: 執行測試確認通過**

Run: `cd web && bun test tests/components`
Expected: PASS（含前一 Task 的元件測試，共 6 個）。

- [ ] **Step 6: Commit**

```bash
git add web/src/components/NewQuestForm.tsx web/src/components/CheckpointPrompt.tsx web/src/hooks web/tests/components/NewQuestForm.test.tsx web/tests/components/CheckpointPrompt.test.tsx
git commit -m "feat: [web] add interactive quest form, checkpoint prompt, and hooks"
```

---

## Task 15: 大廳組裝（App / Hall）

**Files:**
- Modify: `web/src/App.tsx`
- Create: `web/src/components/Hall.tsx`
- Test: `web/tests/components/Hall.test.tsx`

**Interfaces:**
- Consumes: 全部元件與 hooks、`api`。
- Produces: `Hall()` — 載入 workflows 與 runs、管理 selectedId、訂閱 SSE 更新選中 run、渲染 HudBar + Scene（NPC/玩家/冒險者 sprite）+ QuestMenu + NewQuestForm + 底部 DialogBox/CheckpointPrompt。`App` 改為渲染 `<Hall/>`。

- [ ] **Step 1: 寫失敗測試**

Create `web/tests/components/Hall.test.tsx`:

```tsx
import { test, expect, afterEach } from "bun:test";
import { render, screen, waitFor } from "@testing-library/react";
import { Hall } from "../../src/components/Hall";

const realFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = realFetch; });

class FakeEventSource {
  addEventListener() {}
  close() {}
  constructor(public url: string) {}
}

test("Hall 載入後顯示任務佈告欄與 NPC 插槽", async () => {
  (globalThis as any).EventSource = FakeEventSource;
  globalThis.fetch = (async (url: string) => {
    if (url.includes("/workflows")) return new Response(JSON.stringify({ success: true, data: [] }), { status: 200 });
    if (url.includes("/runs")) return new Response(JSON.stringify({ success: true, data: [] }), { status: 200 });
    return new Response(JSON.stringify({ success: true, data: null }), { status: 200 });
  }) as typeof fetch;

  render(<Hall />);
  await waitFor(() => expect(screen.getByText("任務佈告欄")).toBeDefined());
  expect(screen.getByText("NPC 公會主")).toBeDefined();
});
```

- [ ] **Step 2: 執行確認失敗**

Run: `cd web && bun test tests/components/Hall.test.tsx`
Expected: FAIL —「Cannot find module '../../src/components/Hall'」。

- [ ] **Step 3: 實作 Hall 與 App**

Create `web/src/components/Hall.tsx`:

```tsx
import { useCallback, useEffect, useState } from "react";
import { api } from "../api/client";
import type { Run, WorkflowSummary } from "../api/types";
import { useRun } from "../hooks/useRun";
import { useRunEvents } from "../hooks/useRunEvents";
import { HudBar } from "./HudBar";
import { Scene } from "./Scene";
import { Sprite } from "./Sprite";
import { QuestMenu } from "./QuestMenu";
import { NewQuestForm } from "./NewQuestForm";
import { DialogBox } from "./DialogBox";
import { CheckpointPrompt } from "./CheckpointPrompt";

export function Hall() {
  const [workflows, setWorkflows] = useState<WorkflowSummary[]>([]);
  const [runs, setRuns] = useState<Run[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const { detail, reload } = useRun(selectedId);

  const loadRuns = useCallback(() => { api.listRuns().then(setRuns).catch((e) => console.error(e)); }, []);
  useEffect(() => { api.listWorkflows().then(setWorkflows).catch((e) => console.error(e)); loadRuns(); }, [loadRuns]);

  const onEvent = useCallback(() => { reload(); loadRuns(); }, [reload, loadRuns]);
  useRunEvents(selectedId, onEvent);

  const pending = detail?.checkpoints.find((c) => c.decision === "pending") ?? null;
  const lastStep = detail?.steps[detail.steps.length - 1];

  return (
    <div style={{ maxWidth: 760, margin: "0 auto", display: "grid", gap: 12 }}>
      <HudBar title="勇者公會大廳" />
      <div style={{ display: "grid", gridTemplateColumns: "1fr 260px", gap: 12 }}>
        <Scene>
          <Sprite assetKey="npc-master" label="NPC 公會主" className="" />
          <Sprite assetKey="player" label="玩家角色" className="" />
        </Scene>
        <div style={{ display: "grid", gap: 12 }}>
          <QuestMenu runs={runs} selectedId={selectedId} onSelect={setSelectedId} />
          <NewQuestForm workflows={workflows} onCreated={(id) => { setSelectedId(id); loadRuns(); }} />
        </div>
      </div>
      {selectedId && detail && (
        pending
          ? <CheckpointPrompt runId={selectedId} checkpoint={pending} onDecided={() => { reload(); loadRuns(); }} />
          : <DialogBox speaker="公會主">
              {detail.run.status === "completed" ? "任務完成，做得好，勇者！"
                : detail.run.status === "failed" ? "唔……勇者倒下了，這趟任務失敗了。"
                : detail.run.status === "rejected" ? "這份委託被退回了。"
                : lastStep ? `勇者正在進行：${lastStep.stageId}……`
                : "勇者整裝待發。"}
            </DialogBox>
      )}
    </div>
  );
}
```

Modify `web/src/App.tsx`（覆寫）：

```tsx
import "./theme/ct-window.css";
import "./theme/scene.css";
import { Hall } from "./components/Hall";

export function App() {
  return <Hall />;
}
```

- [ ] **Step 4: 執行測試確認通過**

Run: `cd web && bun test tests/components/Hall.test.tsx`
Expected: PASS。

- [ ] **Step 5: 更新 smoke 測試**

既有 `web/tests/smoke.test.tsx` 斷言「勇者公會大廳」標題文字仍成立（HudBar title 保留該字串），但改為 mock fetch/EventSource 以免真連線。覆寫 `web/tests/smoke.test.tsx`：

```tsx
import { test, expect, afterEach } from "bun:test";
import { render, screen, waitFor } from "@testing-library/react";
import { App } from "../src/App";

const realFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = realFetch; });
class FakeEventSource { addEventListener() {} close() {} constructor(public url: string) {} }

test("App 渲染大廳", async () => {
  (globalThis as any).EventSource = FakeEventSource;
  globalThis.fetch = (async () => new Response(JSON.stringify({ success: true, data: [] }), { status: 200 })) as typeof fetch;
  render(<App />);
  await waitFor(() => expect(screen.getByText("勇者公會大廳")).toBeDefined());
});
```

- [ ] **Step 6: 全前端測試 + 建置**

Run: `cd web && bun test`
Expected: 全數 PASS。

Run: `cd web && bun run build`
Expected: 產出 `web/dist`，無型別/建置錯誤。

- [ ] **Step 7: Commit**

```bash
git add web/src/components/Hall.tsx web/src/App.tsx web/tests/components/Hall.test.tsx web/tests/smoke.test.tsx
git commit -m "feat: [web] assemble hall screen wiring components and SSE"
```

---

## Task 16: 端對端測試（Playwright）

**Files:**
- Create: `web/playwright.config.ts` · `web/tests/e2e/quest-flow.spec.ts`
- Create: `workflows/e2e-demo.yaml`（E2E 用、含 checkpoint 的極短 workflow）
- Modify: `web/package.json`（加 `e2e` script）

**Interfaces:**
- Consumes: 已建置前端（`web/dist`）、後端 `createServer`（透過 `AIPIPE_MOCK=1` 用 MockDriver）。
- Produces: 一條走完「發任務 → 看進度 → 核可 → 完成」的 E2E。

- [ ] **Step 1: 安裝 Playwright**

Run:
```bash
cd web && bun add -d @playwright/test
cd web && bunx playwright install chromium
```
Expected: Playwright 與 Chromium 安裝完成。

- [ ] **Step 2: 建 E2E workflow 與設定**

Create `workflows/e2e-demo.yaml`:

```yaml
name: e2e-demo
description: E2E 用最短含檢查點流程
inputs:
  - name: topic
    required: true
stages:
  - id: research
    name: 蒐集資料
    agent:
      prompt: "研究 {{topic}}"
    output: notes
    checkpoint:
      prompt: "資料看起來 OK 嗎？"
  - id: finalize
    name: 收尾
    agent:
      prompt: "整理 {{notes}}"
    output: final
```

Create `web/playwright.config.ts`:

```ts
import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 30_000,
  use: { baseURL: "http://localhost:3100" },
  webServer: {
    command: "AIPIPE_MOCK=1 AIPIPE_PORT=3100 AIPIPE_DB=:memory: AIPIPE_STATIC=./dist AIPIPE_WORKFLOWS=../workflows bun run ../src/server/index.ts",
    url: "http://localhost:3100/api/workflows",
    reuseExistingServer: false,
    cwd: __dirname,
  },
});
```

（註：E2E 前需 `bun run build` 產出 `web/dist`，讓後端伺服靜態前端；下方 Step 4 指令包含建置。）

- [ ] **Step 3: 寫 E2E 測試**

Create `web/tests/e2e/quest-flow.spec.ts`:

```ts
import { test, expect } from "@playwright/test";

test("發任務 → 檢查點 → 核可 → 完成", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByText("勇者公會大廳")).toBeVisible();

  // 發任務
  await page.getByRole("combobox").selectOption("e2e-demo");
  await page.getByLabel("topic").fill("Bun 入門");
  await page.getByText("發佈任務").click();

  // 命中檢查點 → 出現核可對白
  await expect(page.getByText("資料看起來 OK 嗎？")).toBeVisible({ timeout: 15_000 });

  // 核可 → 續跑至完成
  await page.getByText("▶ 核可").click();
  await expect(page.getByText("任務完成，做得好，勇者！")).toBeVisible({ timeout: 15_000 });
});
```

- [ ] **Step 4: 加 script 並執行**

修改 `web/package.json` 的 `scripts` 加：`"e2e": "bun run build && playwright test"`。

Run: `cd web && bun run e2e`
Expected: 1 passed。（Playwright 會依 config 自動啟動後端；MockDriver 讓流程無需真 `claude`。）

- [ ] **Step 5: Commit**

```bash
git add web/playwright.config.ts web/tests/e2e/quest-flow.spec.ts web/package.json workflows/e2e-demo.yaml
git commit -m "test: [e2e] add quest lifecycle Playwright test"
```

---

## Task 17: 素材清單文件

**Files:**
- Create: `docs/assets/manifest.md`

**Interfaces:**
- Produces: 給使用者外部生成像素素材的清單 + 每項的生成 prompt 與規格，對齊 `assets.config.ts` 的 `AssetKey`。

- [ ] **Step 1: 撰寫素材清單**

Create `docs/assets/manifest.md`:

```markdown
# 勇者大廳 — 像素素材清單（Chrono Trigger 風格）

前端所有素材走設定驅動：把生成好的檔案放到 `web/public/assets/`，再到 `web/src/assets/assets.config.ts`
把對應 `AssetKey` 的值從 `null` 改成路徑（如 `/assets/scene-bg.png`）。未填時自動 fallback 到 CSS 佔位，不會壞。

整體風格關鍵字（貼在每個 prompt 前）：
`16-bit SNES JRPG, Chrono Trigger style, Akira Toriyama influence, bright warm daylight palette, crisp pixel art, no anti-aliasing`

| AssetKey | 檔名建議 | 用途 | 規格 | 生成 prompt |
|----------|----------|------|------|-------------|
| `scene-bg` | `scene-bg.png` | 大廳場景背景 | 640×480、俯視 3/4、可平舖地板 | 「…top-down guild hall interior, warm stone plaza floor, wooden reception counter, banners, sunlit」 |
| `npc-master` | `npc-master.png` | 櫃檯後公會主 | 64×96、透明背景、正面 | 「…guild master NPC standing behind counter, bearded, robed, front-facing sprite」 |
| `player` | `player.png` | 玩家角色 | 56×96、透明背景 | 「…young adventurer hero sprite, front-facing, sword on back」 |
| `adventurer` | `adventurer.png` | 場景氛圍冒險者 | 48×72、透明背景 | 「…generic adventurer townsperson sprite, front-facing」 |
| `portrait-master` | `portrait-master.png` | 對話框頭像（公會主） | 48×48、透明背景 | 「…dialogue portrait bust of guild master, CT dialogue window style」 |
| `portrait-hero` | `portrait-hero.png` | 對話框頭像（勇者） | 48×48、透明背景 | 「…dialogue portrait bust of hero」 |

## 音效（可選，之後子專案再接）

| 用途 | 檔名建議 | 生成/取得方向 |
|------|----------|---------------|
| 游標移動 | `sfx-cursor.wav` | 8-bit UI blip |
| 核可 | `sfx-confirm.wav` | 8-bit confirm jingle |
| 任務完成 | `sfx-complete.wav` | 8-bit victory jingle |

## 放回流程

1. 生成 → 放 `web/public/assets/<檔名>`。
2. 編輯 `web/src/assets/assets.config.ts`，把該 key 值改為 `"/assets/<檔名>"`。
3. `cd web && bun run dev`，重新整理即可看到素材取代佔位。
```

- [ ] **Step 2: Commit**

```bash
git add docs/assets/manifest.md
git commit -m "docs: [assets] add pixel asset manifest with generation prompts"
```

---

## Task 18: 收尾 — README 與根 .gitignore

**Files:**
- Modify: `.gitignore`（加 `web/node_modules`、`web/dist`、Playwright 產物）
- Create: `docs/running.md`（如何啟動後端 + 前端的簡短說明）

- [ ] **Step 1: 更新 .gitignore**

在根 `.gitignore` 追加：

```
web/node_modules/
web/dist/
web/test-results/
web/playwright-report/
```

- [ ] **Step 2: 寫啟動說明**

Create `docs/running.md`:

```markdown
# 啟動勇者大廳（子專案 2）

## 開發模式（兩個行程）

終端機 A（後端 API，:3000）：

    bun run server

終端機 B（前端 dev，:5173，proxy /api → :3000）：

    cd web && bun run dev

瀏覽器開 http://localhost:5173 。

真實 `claude` 需已登入；若只想看流程可用模擬驅動：

    AIPIPE_MOCK=1 bun run server

## 正式模式（單一行程）

    cd web && bun run build      # 產出 web/dist
    AIPIPE_STATIC=./web/dist bun run server   # 後端同時伺服前端與 API，開 http://localhost:3000

## 測試

    bun test            # 後端 + 引擎
    cd web && bun test  # 前端單元/元件
    cd web && bun run e2e   # Playwright E2E（自動起後端，用 MockDriver）
```

- [ ] **Step 3: 全套件回歸**

Run: `bun test && cd web && bun test`
Expected: 後端與前端測試全數 PASS。

- [ ] **Step 4: Commit**

```bash
git add .gitignore docs/running.md
git commit -m "docs: [ops] add running guide and ignore web build artifacts"
```

---

## Self-Review

**1. Spec coverage：**
- §2 架構/佈局 → Tasks 3–15 檔案結構落地。✅
- §3 API 端點（workflows/runs/get/approve/reject/events）→ Tasks 5,7,8,9。✅
- §4 SSE 事件（snapshot/stage:start/stage:done/checkpoint/run:done/run:failed/ping）→ Tasks 6,8；另補 `run:rejected`（Task 6 標註為 spec 精修）。✅
- §5 引擎 observer hook + 非阻塞拆分 → Tasks 1,2。✅
- §6 前端元件（Hall/Scene/HudBar/QuestMenu/DialogBox/CheckpointPrompt/NewQuestForm/hooks）→ Tasks 13,14,15。✅
- §6 素材設定驅動 + 缺檔 fallback → Task 12（assets.config）+ Sprite/Scene（Task 13,15）。✅
- §7 素材清單交付 → Task 17。✅
- §8 錯誤處理（400/404/409、背景失敗、SSE try/catch、前端重連）→ Tasks 4,6,7,8,11。✅
- §9 測試（單元/整合/E2E、MockDriver）→ 各 Task 測試 + Task 9 整合 + Task 16 E2E。✅
- §10 後續接口（token 串流/權限/多驅動/素材）→ 皆由現有抽象承接，無需本子專案任務。✅

**2. Placeholder scan：** 無 TBD/TODO；每個 code step 皆含完整程式。✅

**3. Type consistency：**
- `RunObserver` callback 形狀在 Task 1（定義）、Task 6（`makeObserver` 使用）一致。✅
- `ApiResult`／envelope `{ success, data?, error? }` 在 Tasks 7,9 與前端 `client.ts`（Task 11）一致。✅
- 事件型別字串（`stage:start` 等）在 Task 6（publish）、Task 8（TERMINAL/formatSse）、Task 11（sse `EVENT_TYPES`）一致。✅
- `RunDetail = { run, steps, checkpoints }` 在 Task 7（`getRunHandler` data）與 Task 11（types）一致。✅
- `AssetKey` 六個值在 Task 12（定義）、Task 13（Sprite/Scene）、Task 17（manifest 表）一致。✅
```
