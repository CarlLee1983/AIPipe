# Quest Engine 核心 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 打造 AIPipe 子專案 1 的 Quest Engine 核心 —— 宣告式工作流 schema、可恢復的執行引擎、Claude/Mock driver、`bun:sqlite` 持久化，與極簡 CLI，跑通 `YAML → 逐階段執行 → 命中檢查點暫停 → CLI 核可 → 續跑至完成`。

**Architecture:** 純後端、無 UI。分層：`schema`（zod 驗證的任務卷軸）→ `engine`（無長駐記憶體的狀態機，每階段持久化後返回）→ `driver`（薄轉接層 spawn `claude`，可換 Mock）→ `store`（Repository 模式包 `bun:sqlite`）→ `cli`（`util.parseArgs` 觸發與查詢）。引擎用依賴注入（傳入 repos + driver），因此測試以 MockDriver + `:memory:` DB 完整覆蓋，暫停/恢復跨行程靠 SQLite 快照而非記憶體。

**Tech Stack:** Bun + TypeScript、zod（schema 驗證）、`yaml`（YAML 解析）、`bun:sqlite`（持久化）、`bun:test`（測試）、`Bun.spawn`（driver）、`node:util` `parseArgs`（CLI）。

## Global Constraints

以下規則為專案級要求，每個 task 的實作都隱含包含本節（值均照 spec 逐字抄錄）：

- **執行環境**：Bun（開發機為 1.3.10）+ TypeScript，`"type": "module"`，全程用 Bun runtime / `bun test`，不引入 Node 打包器。
- **依賴上限**：僅 `zod`（pin `^3.23.8`）與 `yaml`（`^2.5.0`）兩個 runtime 依賴 + dev `@types/bun`。CLI 參數解析用內建 `node:util` `parseArgs`，不引重依賴。
- **持久化**：`bun:sqlite`，`new Database(path, { strict: true })`（strict 模式綁定具名參數不需 `$`/`:`/`@` 前綴）。所有時間戳以 **ISO 8601 字串**（`new Date().toISOString()`）儲存。
- **不可變**：context 每階段回傳**新**物件（`{ ...ctx, [name]: value }`），不原地改輸入。
- **邊界驗證**：YAML 載入與 CLI input 在邊界驗證；內部呼叫信任。驗證失敗擲出帶明確訊息的錯誤，不靜默吞掉。
- **檔案聚焦**：200–400 行典型、800 上限，多小檔勝過少大檔。
- **測試**：TDD（先寫失敗測試），目標覆蓋率 80%+。真實 `ClaudeCodeDriver` 為可跳過 smoke test，不進 CI 必跑。
- **模組匯入**：用無副檔名相對路徑（`from "../schema/workflow"`），交給 Bun 解析 `.ts`。
- **命名**：schema 型別用領域名（`Workflow`/`Stage`/`Checkpoint`），store 資料列型別加 `Record` 後綴（`Run`/`StepRecord`/`CheckpointRecord`）以免與 schema 的 `Checkpoint` 撞名。

---

### Task 1: 專案骨架與工具鏈

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `tests/smoke.test.ts`

**Interfaces:**
- Consumes: 無（起始 task）。
- Produces: 可執行的 `bun test`；後續 task 依賴 `zod`、`yaml`、`bun:sqlite`、`bun:test` 均可 import。

- [ ] **Step 1: 寫入 `package.json`**

```json
{
  "name": "aipipe",
  "version": "0.1.0",
  "type": "module",
  "module": "src/cli/index.ts",
  "bin": { "aipipe": "src/cli/index.ts" },
  "scripts": {
    "test": "bun test",
    "cli": "bun run src/cli/index.ts"
  },
  "dependencies": {
    "yaml": "^2.5.0",
    "zod": "^3.23.8"
  },
  "devDependencies": {
    "@types/bun": "latest"
  }
}
```

- [ ] **Step 2: 寫入 `tsconfig.json`**

```json
{
  "compilerOptions": {
    "lib": ["ESNext"],
    "target": "ESNext",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "types": ["@types/bun"],
    "strict": true,
    "noEmit": true,
    "skipLibCheck": true,
    "esModuleInterop": true,
    "resolveJsonModule": true
  },
  "include": ["src", "tests"]
}
```

- [ ] **Step 3: 安裝依賴**

Run: `bun install`
Expected: 建立 `bun.lock` 與 `node_modules/`，安裝 `zod`、`yaml`、`@types/bun`，無錯誤。

- [ ] **Step 4: 寫失敗的 smoke 測試**

```ts
// tests/smoke.test.ts
import { test, expect } from "bun:test";
import { Database } from "bun:sqlite";

test("bun runtime, sqlite, zod, yaml 都可用", async () => {
  const { z } = await import("zod");
  const YAML = await import("yaml");
  const db = new Database(":memory:", { strict: true });
  const row = db.query("SELECT 1 AS one").get() as { one: number };

  expect(row.one).toBe(1);
  expect(z.string().parse("hi")).toBe("hi");
  expect(YAML.parse("a: 1")).toEqual({ a: 1 });
});
```

- [ ] **Step 5: 執行測試確認通過**

Run: `bun test tests/smoke.test.ts`
Expected: PASS（1 test passing）。

- [ ] **Step 6: Commit**

```bash
git add package.json tsconfig.json bun.lock tests/smoke.test.ts
git commit -m "chore: [core] scaffold Bun+TS project with zod/yaml/sqlite"
```

---

### Task 2: 工作流 Schema 型別與 zod 驗證

**Files:**
- Create: `src/schema/workflow.ts`
- Create: `tests/schema/workflow.test.ts`

**Interfaces:**
- Consumes: `zod`。
- Produces:
  - `WorkflowSchema`（zod schema）
  - `type Workflow = { name: string; description?: string; inputs: InputDef[]; stages: Stage[] }`
  - `type Stage = { id: string; name?: string; agent: AgentSpec; output?: string; checkpoint?: Checkpoint }`
  - `type AgentSpec = { prompt: string; allowedTools?: string[]; model?: string; cwd?: string }`
  - `type Checkpoint = { prompt: string }`
  - `type InputDef = { name: string; required: boolean; default?: string }`

- [ ] **Step 1: 寫失敗測試**

```ts
// tests/schema/workflow.test.ts
import { test, expect } from "bun:test";
import { WorkflowSchema } from "../../src/schema/workflow";

const valid = {
  name: "write-blog-post",
  stages: [{ id: "research", agent: { prompt: "hi" } }],
};

test("合法 workflow 解析成功並套用預設", () => {
  const wf = WorkflowSchema.parse(valid);
  expect(wf.name).toBe("write-blog-post");
  expect(wf.inputs).toEqual([]); // inputs 預設空陣列
  expect(wf.stages[0].agent.prompt).toBe("hi");
});

test("input.required 預設為 false", () => {
  const wf = WorkflowSchema.parse({
    ...valid,
    inputs: [{ name: "topic" }],
  });
  expect(wf.inputs[0].required).toBe(false);
});

test("name 非 kebab-case 應失敗", () => {
  const r = WorkflowSchema.safeParse({ ...valid, name: "Write Blog" });
  expect(r.success).toBe(false);
});

test("stages 為空應失敗", () => {
  const r = WorkflowSchema.safeParse({ ...valid, stages: [] });
  expect(r.success).toBe(false);
});

test("stage 缺 agent 應失敗", () => {
  const r = WorkflowSchema.safeParse({ ...valid, stages: [{ id: "x" }] });
  expect(r.success).toBe(false);
});
```

- [ ] **Step 2: 執行測試確認失敗**

Run: `bun test tests/schema/workflow.test.ts`
Expected: FAIL（`Cannot find module '../../src/schema/workflow'`）。

- [ ] **Step 3: 寫最小實作**

```ts
// src/schema/workflow.ts
import { z } from "zod";

export const InputDefSchema = z.object({
  name: z.string().min(1),
  required: z.boolean().default(false),
  default: z.string().optional(),
});

export const AgentSpecSchema = z.object({
  prompt: z.string().min(1),
  allowedTools: z.array(z.string()).optional(),
  model: z.string().optional(),
  cwd: z.string().optional(),
});

export const CheckpointSchema = z.object({
  prompt: z.string().min(1),
});

export const StageSchema = z.object({
  id: z.string().min(1),
  name: z.string().optional(),
  agent: AgentSpecSchema,
  output: z.string().optional(),
  checkpoint: CheckpointSchema.optional(),
});

export const WorkflowSchema = z.object({
  name: z
    .string()
    .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, "name 必須為 kebab-case"),
  description: z.string().optional(),
  inputs: z.array(InputDefSchema).default([]),
  stages: z.array(StageSchema).min(1, "至少需要一個 stage"),
});

export type InputDef = z.infer<typeof InputDefSchema>;
export type AgentSpec = z.infer<typeof AgentSpecSchema>;
export type Checkpoint = z.infer<typeof CheckpointSchema>;
export type Stage = z.infer<typeof StageSchema>;
export type Workflow = z.infer<typeof WorkflowSchema>;
```

- [ ] **Step 4: 執行測試確認通過**

Run: `bun test tests/schema/workflow.test.ts`
Expected: PASS（5 tests passing）。

- [ ] **Step 5: Commit**

```bash
git add src/schema/workflow.ts tests/schema/workflow.test.ts
git commit -m "feat: [schema] add workflow zod schema and types"
```

---

### Task 3: 工作流載入器與跨欄位驗證

**Files:**
- Create: `src/schema/parse.ts`
- Create: `tests/schema/parse.test.ts`

**Interfaces:**
- Consumes: `WorkflowSchema`、`Workflow`（Task 2）；`yaml`。
- Produces:
  - `type LoadResult = { workflow: Workflow; warnings: string[] }`
  - `loadWorkflowFromString(text: string): LoadResult` —— YAML 解析 + zod 驗證 + 跨欄位致命檢查（擲錯）+ 收集未定義變數警告（非致命）。
  - `loadWorkflowFile(path: string): Promise<LoadResult>` —— 讀檔後委派 `loadWorkflowFromString`。

- [ ] **Step 1: 寫失敗測試**

```ts
// tests/schema/parse.test.ts
import { test, expect } from "bun:test";
import { loadWorkflowFromString } from "../../src/schema/parse";

const yaml = `
name: demo
inputs:
  - name: topic
    required: true
stages:
  - id: research
    agent:
      prompt: "研究 {{topic}}"
    output: notes
  - id: draft
    agent:
      prompt: "根據 {{notes}} 撰稿"
    output: draft
`;

test("載入合法 YAML 回傳 workflow 且無警告", () => {
  const { workflow, warnings } = loadWorkflowFromString(yaml);
  expect(workflow.name).toBe("demo");
  expect(workflow.stages).toHaveLength(2);
  expect(warnings).toEqual([]);
});

test("重複 stage id 擲錯", () => {
  const dup = `
name: demo
stages:
  - id: a
    agent: { prompt: "x" }
  - id: a
    agent: { prompt: "y" }
`;
  expect(() => loadWorkflowFromString(dup)).toThrow(/stage id .*a.* 重複/);
});

test("output 與 input 名衝突擲錯", () => {
  const clash = `
name: demo
inputs:
  - name: topic
stages:
  - id: a
    agent: { prompt: "x" }
    output: topic
`;
  expect(() => loadWorkflowFromString(clash)).toThrow(/output .*topic.* 衝突/);
});

test("重複 output 名擲錯", () => {
  const dup = `
name: demo
stages:
  - id: a
    agent: { prompt: "x" }
    output: notes
  - id: b
    agent: { prompt: "y" }
    output: notes
`;
  expect(() => loadWorkflowFromString(dup)).toThrow(/output .*notes.* 重複/);
});

test("引用未定義變數 → 警告非致命", () => {
  const undef = `
name: demo
stages:
  - id: a
    agent: { prompt: "用 {{missing}} 做事" }
`;
  const { warnings } = loadWorkflowFromString(undef);
  expect(warnings.some((w) => w.includes("missing"))).toBe(true);
});

test("YAML 語法錯誤擲錯", () => {
  expect(() => loadWorkflowFromString("name: [unclosed")).toThrow();
});
```

- [ ] **Step 2: 執行測試確認失敗**

Run: `bun test tests/schema/parse.test.ts`
Expected: FAIL（`Cannot find module '../../src/schema/parse'`）。

- [ ] **Step 3: 寫最小實作**

```ts
// src/schema/parse.ts
import { parse as parseYaml } from "yaml";
import { WorkflowSchema, type Workflow } from "./workflow";

export interface LoadResult {
  workflow: Workflow;
  warnings: string[];
}

const VAR_RE = /\{\{\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*\}\}/g;

function extractVars(text: string): string[] {
  const names: string[] = [];
  for (const m of text.matchAll(VAR_RE)) names.push(m[1]);
  return names;
}

export function loadWorkflowFromString(text: string): LoadResult {
  const raw = parseYaml(text); // YAML 語法錯誤在此擲出
  const workflow = WorkflowSchema.parse(raw); // zod 驗證，失敗擲出

  // 跨欄位致命檢查：stage id 唯一
  const seenIds = new Set<string>();
  for (const stage of workflow.stages) {
    if (seenIds.has(stage.id)) {
      throw new Error(`workflow "${workflow.name}"：stage id "${stage.id}" 重複`);
    }
    seenIds.add(stage.id);
  }

  // output 不得重複、不得與 input 名衝突
  const inputNames = new Set(workflow.inputs.map((i) => i.name));
  const seenOutputs = new Set<string>();
  for (const stage of workflow.stages) {
    if (!stage.output) continue;
    if (inputNames.has(stage.output)) {
      throw new Error(`workflow "${workflow.name}"：output "${stage.output}" 與 input 名衝突`);
    }
    if (seenOutputs.has(stage.output)) {
      throw new Error(`workflow "${workflow.name}"：output "${stage.output}" 重複`);
    }
    seenOutputs.add(stage.output);
  }

  // 未定義變數 → 警告（非致命）。逐階段累積可用變數（inputs + 先前 outputs）。
  const warnings: string[] = [];
  const available = new Set(inputNames);
  for (const stage of workflow.stages) {
    const referenced = [
      ...extractVars(stage.agent.prompt),
      ...(stage.checkpoint ? extractVars(stage.checkpoint.prompt) : []),
    ];
    for (const name of referenced) {
      if (!available.has(name)) {
        warnings.push(`stage "${stage.id}" 引用未定義變數 {{${name}}}`);
      }
    }
    if (stage.output) available.add(stage.output);
  }

  return { workflow, warnings };
}

export async function loadWorkflowFile(path: string): Promise<LoadResult> {
  const text = await Bun.file(path).text();
  return loadWorkflowFromString(text);
}
```

- [ ] **Step 4: 執行測試確認通過**

Run: `bun test tests/schema/parse.test.ts`
Expected: PASS（6 tests passing）。

- [ ] **Step 5: Commit**

```bash
git add src/schema/parse.ts tests/schema/parse.test.ts
git commit -m "feat: [schema] add workflow loader with cross-field validation"
```

---

### Task 4: Context 與變數內插

**Files:**
- Create: `src/engine/context.ts`
- Create: `tests/engine/context.test.ts`

**Interfaces:**
- Consumes: `Workflow`（Task 2）。
- Produces:
  - `type Context = Record<string, string>`
  - `type InterpolateResult = { text: string; missing: string[] }`
  - `interpolate(template: string, context: Context): InterpolateResult` —— 取代 `{{var}}`；未定義變數以空字串代入並列入 `missing`。
  - `withOutput(context: Context, name: string, value: string): Context` —— 回傳**新**物件。
  - `resolveInputs(workflow: Workflow, provided: Record<string, string>): Context` —— 套用 input 預設值；缺 required 且無預設則擲錯。

- [ ] **Step 1: 寫失敗測試**

```ts
// tests/engine/context.test.ts
import { test, expect } from "bun:test";
import { interpolate, withOutput, resolveInputs } from "../../src/engine/context";
import type { Workflow } from "../../src/schema/workflow";

test("interpolate 取代已定義變數", () => {
  const r = interpolate("嗨 {{name}}", { name: "Bun" });
  expect(r.text).toBe("嗨 Bun");
  expect(r.missing).toEqual([]);
});

test("interpolate 未定義變數以空字串代入並記錄", () => {
  const r = interpolate("值={{x}}!", {});
  expect(r.text).toBe("值=!");
  expect(r.missing).toEqual(["x"]);
});

test("withOutput 回傳新物件不改原輸入", () => {
  const base = { a: "1" };
  const next = withOutput(base, "b", "2");
  expect(next).toEqual({ a: "1", b: "2" });
  expect(base).toEqual({ a: "1" }); // 原物件不變
  expect(next).not.toBe(base);
});

const wf = {
  name: "demo",
  inputs: [
    { name: "topic", required: true },
    { name: "lang", required: false, default: "zh" },
  ],
  stages: [{ id: "a", agent: { prompt: "x" } }],
} as unknown as Workflow;

test("resolveInputs 套用預設值", () => {
  const ctx = resolveInputs(wf, { topic: "Bun" });
  expect(ctx).toEqual({ topic: "Bun", lang: "zh" });
});

test("resolveInputs 缺 required 擲錯", () => {
  expect(() => resolveInputs(wf, {})).toThrow(/topic/);
});
```

- [ ] **Step 2: 執行測試確認失敗**

Run: `bun test tests/engine/context.test.ts`
Expected: FAIL（`Cannot find module '../../src/engine/context'`）。

- [ ] **Step 3: 寫最小實作**

```ts
// src/engine/context.ts
import type { Workflow } from "../schema/workflow";

export type Context = Record<string, string>;

export interface InterpolateResult {
  text: string;
  missing: string[];
}

const VAR_RE = /\{\{\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*\}\}/g;

export function interpolate(template: string, context: Context): InterpolateResult {
  const missing: string[] = [];
  const text = template.replace(VAR_RE, (_full, name: string) => {
    if (name in context) return context[name];
    missing.push(name);
    return "";
  });
  return { text, missing };
}

export function withOutput(context: Context, name: string, value: string): Context {
  return { ...context, [name]: value };
}

export function resolveInputs(
  workflow: Workflow,
  provided: Record<string, string>,
): Context {
  const ctx: Context = {};
  for (const input of workflow.inputs) {
    if (input.name in provided) {
      ctx[input.name] = provided[input.name];
    } else if (input.default !== undefined) {
      ctx[input.name] = input.default;
    } else if (input.required) {
      throw new Error(`缺少必填 input：${input.name}`);
    }
  }
  return ctx;
}
```

- [ ] **Step 4: 執行測試確認通過**

Run: `bun test tests/engine/context.test.ts`
Expected: PASS（5 tests passing）。

- [ ] **Step 5: Commit**

```bash
git add src/engine/context.ts tests/engine/context.test.ts
git commit -m "feat: [engine] add immutable context and variable interpolation"
```

---

### Task 5: Driver 介面與 MockDriver

**Files:**
- Create: `src/driver/types.ts`
- Create: `src/driver/mock.ts`
- Create: `tests/driver/mock.test.ts`

**Interfaces:**
- Consumes: 無。
- Produces:
  - `interface DriverInput { prompt: string; allowedTools?: string[]; model?: string; cwd?: string }`
  - `interface DriverResult { output: string; success: boolean; raw: unknown }`
  - `interface AgentDriver { run(input: DriverInput): Promise<DriverResult> }`
  - `type MockResponse = { output: string; success?: boolean; raw?: unknown }`
  - `class MockDriver implements AgentDriver`，建構子接受 `MockResponse[]`（依序回傳）或 `(input) => MockResponse`；公開 `calls: DriverInput[]` 記錄呼叫。

- [ ] **Step 1: 寫失敗測試**

```ts
// tests/driver/mock.test.ts
import { test, expect } from "bun:test";
import { MockDriver } from "../../src/driver/mock";

test("依序回傳預錄輸出並記錄呼叫", async () => {
  const driver = new MockDriver([
    { output: "第一次" },
    { output: "第二次", success: false },
  ]);

  const r1 = await driver.run({ prompt: "a" });
  const r2 = await driver.run({ prompt: "b" });

  expect(r1.output).toBe("第一次");
  expect(r1.success).toBe(true); // success 預設 true
  expect(r2.success).toBe(false);
  expect(driver.calls.map((c) => c.prompt)).toEqual(["a", "b"]);
});

test("函式模式依 input 回應", async () => {
  const driver = new MockDriver((input) => ({ output: input.prompt.toUpperCase() }));
  const r = await driver.run({ prompt: "hi" });
  expect(r.output).toBe("HI");
});

test("回應用盡後擲錯", async () => {
  const driver = new MockDriver([{ output: "only" }]);
  await driver.run({ prompt: "a" });
  expect(driver.run({ prompt: "b" })).rejects.toThrow(/MockDriver/);
});
```

- [ ] **Step 2: 執行測試確認失敗**

Run: `bun test tests/driver/mock.test.ts`
Expected: FAIL（`Cannot find module '../../src/driver/mock'`）。

- [ ] **Step 3: 寫最小實作**

```ts
// src/driver/types.ts
export interface DriverInput {
  prompt: string;
  allowedTools?: string[];
  model?: string;
  cwd?: string;
}

export interface DriverResult {
  output: string;
  success: boolean;
  raw: unknown;
}

export interface AgentDriver {
  run(input: DriverInput): Promise<DriverResult>;
}
```

```ts
// src/driver/mock.ts
import type { AgentDriver, DriverInput, DriverResult } from "./types";

export type MockResponse = {
  output: string;
  success?: boolean;
  raw?: unknown;
};

type Responder = MockResponse[] | ((input: DriverInput) => MockResponse);

export class MockDriver implements AgentDriver {
  readonly calls: DriverInput[] = [];
  private queue: MockResponse[] | null;
  private fn: ((input: DriverInput) => MockResponse) | null;

  constructor(responder: Responder) {
    if (Array.isArray(responder)) {
      this.queue = [...responder];
      this.fn = null;
    } else {
      this.queue = null;
      this.fn = responder;
    }
  }

  async run(input: DriverInput): Promise<DriverResult> {
    this.calls.push(input);
    const response = this.fn ? this.fn(input) : this.queue!.shift();
    if (!response) {
      throw new Error(`MockDriver：預錄回應已用盡（第 ${this.calls.length} 次呼叫）`);
    }
    return {
      output: response.output,
      success: response.success ?? true,
      raw: response.raw ?? { mock: true },
    };
  }
}
```

- [ ] **Step 4: 執行測試確認通過**

Run: `bun test tests/driver/mock.test.ts`
Expected: PASS（3 tests passing）。

- [ ] **Step 5: Commit**

```bash
git add src/driver/types.ts src/driver/mock.ts tests/driver/mock.test.ts
git commit -m "feat: [driver] add AgentDriver interface and MockDriver"
```

---

### Task 6: ClaudeCodeDriver（spawn `claude`）

**Files:**
- Create: `src/driver/claude-code.ts`
- Create: `tests/driver/claude-code.test.ts`

**Interfaces:**
- Consumes: `AgentDriver`、`DriverInput`、`DriverResult`（Task 5）。
- Produces:
  - `buildClaudeArgs(input: DriverInput, command?: string): string[]` —— 組 `claude -p <prompt> --output-format json [--allowedTools a,b] [--model m]`。
  - `parseClaudeJson(stdout: string): { output: string; raw: unknown }` —— 取 JSON 的 `result` 欄位為 output；JSON 無效則擲錯。
  - `type ProcRunner = (args: string[], cwd?: string) => Promise<{ stdout: string; exitCode: number }>`
  - `class ClaudeCodeDriver implements AgentDriver`，建構子 `{ command?: string; run?: ProcRunner }`（`run` 可注入以便測試；預設用 `Bun.spawn`）。

- [ ] **Step 1: 寫失敗測試**

```ts
// tests/driver/claude-code.test.ts
import { test, expect } from "bun:test";
import {
  buildClaudeArgs,
  parseClaudeJson,
  ClaudeCodeDriver,
  type ProcRunner,
} from "../../src/driver/claude-code";

test("buildClaudeArgs 組出正確參數", () => {
  const args = buildClaudeArgs({
    prompt: "hi",
    allowedTools: ["Read", "WebSearch"],
    model: "opus",
  });
  expect(args).toEqual([
    "claude", "-p", "hi",
    "--output-format", "json",
    "--allowedTools", "Read,WebSearch",
    "--model", "opus",
  ]);
});

test("buildClaudeArgs 省略選填參數", () => {
  const args = buildClaudeArgs({ prompt: "hi" });
  expect(args).toEqual(["claude", "-p", "hi", "--output-format", "json"]);
});

test("parseClaudeJson 取 result 欄位", () => {
  const { output } = parseClaudeJson(JSON.stringify({ result: "答案", is_error: false }));
  expect(output).toBe("答案");
});

test("parseClaudeJson 遇無效 JSON 擲錯", () => {
  expect(() => parseClaudeJson("not json")).toThrow();
});

test("run：exit 0 且 is_error=false → success", async () => {
  const fakeRun: ProcRunner = async () => ({
    stdout: JSON.stringify({ result: "ok", is_error: false }),
    exitCode: 0,
  });
  const driver = new ClaudeCodeDriver({ run: fakeRun });
  const r = await driver.run({ prompt: "x" });
  expect(r.success).toBe(true);
  expect(r.output).toBe("ok");
});

test("run：非零退出 → success false", async () => {
  const fakeRun: ProcRunner = async () => ({ stdout: "", exitCode: 1 });
  const driver = new ClaudeCodeDriver({ run: fakeRun });
  const r = await driver.run({ prompt: "x" });
  expect(r.success).toBe(false);
});

test("run：is_error=true → success false", async () => {
  const fakeRun: ProcRunner = async () => ({
    stdout: JSON.stringify({ result: "", is_error: true }),
    exitCode: 0,
  });
  const driver = new ClaudeCodeDriver({ run: fakeRun });
  const r = await driver.run({ prompt: "x" });
  expect(r.success).toBe(false);
});

test("run：JSON 解析失敗 → success false 不擲錯", async () => {
  const fakeRun: ProcRunner = async () => ({ stdout: "garbage", exitCode: 0 });
  const driver = new ClaudeCodeDriver({ run: fakeRun });
  const r = await driver.run({ prompt: "x" });
  expect(r.success).toBe(false);
});

// 真實 claude 的 smoke test：需登入，預設跳過（設 AIPIPE_CLAUDE_SMOKE=1 才跑）
test.skipIf(!process.env.AIPIPE_CLAUDE_SMOKE)("smoke: 真實 claude 回應", async () => {
  const driver = new ClaudeCodeDriver();
  const r = await driver.run({ prompt: "只回覆 pong 兩字" });
  expect(r.success).toBe(true);
  expect(r.output.length).toBeGreaterThan(0);
});
```

- [ ] **Step 2: 執行測試確認失敗**

Run: `bun test tests/driver/claude-code.test.ts`
Expected: FAIL（`Cannot find module '../../src/driver/claude-code'`）。

- [ ] **Step 3: 寫最小實作**

```ts
// src/driver/claude-code.ts
import type { AgentDriver, DriverInput, DriverResult } from "./types";

export function buildClaudeArgs(input: DriverInput, command = "claude"): string[] {
  const args = [command, "-p", input.prompt, "--output-format", "json"];
  if (input.allowedTools?.length) {
    args.push("--allowedTools", input.allowedTools.join(","));
  }
  if (input.model) {
    args.push("--model", input.model);
  }
  return args;
}

export function parseClaudeJson(stdout: string): { output: string; raw: unknown } {
  const parsed = JSON.parse(stdout) as { result?: unknown };
  const output = typeof parsed.result === "string" ? parsed.result : "";
  return { output, raw: parsed };
}

export type ProcRunner = (
  args: string[],
  cwd?: string,
) => Promise<{ stdout: string; exitCode: number }>;

const defaultProcRunner: ProcRunner = async (args, cwd) => {
  const proc = Bun.spawn(args, { cwd, stdout: "pipe", stderr: "pipe" });
  const [stdout, exitCode] = await Promise.all([proc.stdout.text(), proc.exited]);
  return { stdout, exitCode };
};

export class ClaudeCodeDriver implements AgentDriver {
  private command: string;
  private runner: ProcRunner;

  constructor(opts: { command?: string; run?: ProcRunner } = {}) {
    this.command = opts.command ?? "claude";
    this.runner = opts.run ?? defaultProcRunner;
  }

  async run(input: DriverInput): Promise<DriverResult> {
    const args = buildClaudeArgs(input, this.command);
    try {
      const { stdout, exitCode } = await this.runner(args, input.cwd);
      if (exitCode !== 0) {
        return { output: "", success: false, raw: { exitCode, stdout } };
      }
      const { output, raw } = parseClaudeJson(stdout);
      const isError = (raw as { is_error?: boolean }).is_error === true;
      return { output, success: !isError, raw };
    } catch (err) {
      return { output: "", success: false, raw: { error: String(err) } };
    }
  }
}
```

- [ ] **Step 4: 執行測試確認通過**

Run: `bun test tests/driver/claude-code.test.ts`
Expected: PASS（8 tests passing、1 skipped）。

- [ ] **Step 5: Commit**

```bash
git add src/driver/claude-code.ts tests/driver/claude-code.test.ts
git commit -m "feat: [driver] add ClaudeCodeDriver spawning claude CLI"
```

---

### Task 7: DB 初始化與 migration

**Files:**
- Create: `src/store/db.ts`
- Create: `tests/store/db.test.ts`

**Interfaces:**
- Consumes: `bun:sqlite`。
- Produces:
  - `openDb(path: string): Database` —— `new Database(path, { strict: true })`、開 `PRAGMA foreign_keys = ON`、執行 `migrate`。
  - `migrate(db: Database): void` —— 建立 `runs`/`steps`/`checkpoints` 三表（`IF NOT EXISTS`，可重入）。
  - 說明：測試以 `openDb(":memory:")` 取得隔離 DB。

- [ ] **Step 1: 寫失敗測試**

```ts
// tests/store/db.test.ts
import { test, expect } from "bun:test";
import { openDb } from "../../src/store/db";

test("openDb 建立三張表", () => {
  const db = openDb(":memory:");
  const names = db
    .query("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
    .all()
    .map((r) => (r as { name: string }).name);
  expect(names).toContain("runs");
  expect(names).toContain("steps");
  expect(names).toContain("checkpoints");
});

test("migrate 可重入（重跑不報錯）", () => {
  const db = openDb(":memory:");
  // 第二次開同一連線的 migrate 由 openDb 已跑一次；再插入應正常
  db.query(
    "INSERT INTO runs (id, workflow_name, workflow_snapshot, status, inputs, context, current_stage_index, created_at, updated_at) " +
      "VALUES ($id, $wn, $ws, $st, $in, $ctx, $idx, $ca, $ua)",
  ).run({
    id: "r1", wn: "demo", ws: "name: demo", st: "pending",
    in: "{}", ctx: "{}", idx: 0, ca: "2026-07-07T00:00:00.000Z", ua: "2026-07-07T00:00:00.000Z",
  });
  const row = db.query("SELECT id FROM runs WHERE id=$id").get({ id: "r1" });
  expect(row).toEqual({ id: "r1" });
});
```

- [ ] **Step 2: 執行測試確認失敗**

Run: `bun test tests/store/db.test.ts`
Expected: FAIL（`Cannot find module '../../src/store/db'`）。

- [ ] **Step 3: 寫最小實作**

```ts
// src/store/db.ts
import { Database } from "bun:sqlite";

export function migrate(db: Database): void {
  db.run(`
    CREATE TABLE IF NOT EXISTS runs (
      id TEXT PRIMARY KEY,
      workflow_name TEXT NOT NULL,
      workflow_snapshot TEXT NOT NULL,
      status TEXT NOT NULL,
      inputs TEXT NOT NULL,
      context TEXT NOT NULL,
      current_stage_index INTEGER NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
  `);
  db.run(`
    CREATE TABLE IF NOT EXISTS steps (
      id TEXT PRIMARY KEY,
      run_id TEXT NOT NULL REFERENCES runs(id),
      stage_id TEXT NOT NULL,
      prompt TEXT NOT NULL,
      output TEXT,
      status TEXT NOT NULL,
      error TEXT,
      started_at TEXT NOT NULL,
      ended_at TEXT
    );
  `);
  db.run(`
    CREATE TABLE IF NOT EXISTS checkpoints (
      id TEXT PRIMARY KEY,
      run_id TEXT NOT NULL REFERENCES runs(id),
      stage_id TEXT NOT NULL,
      prompt TEXT NOT NULL,
      decision TEXT NOT NULL,
      note TEXT,
      decided_at TEXT
    );
  `);
}

export function openDb(path: string): Database {
  const db = new Database(path, { strict: true });
  db.run("PRAGMA foreign_keys = ON;");
  migrate(db);
  return db;
}
```

- [ ] **Step 4: 執行測試確認通過**

Run: `bun test tests/store/db.test.ts`
Expected: PASS（2 tests passing）。

- [ ] **Step 5: Commit**

```bash
git add src/store/db.ts tests/store/db.test.ts
git commit -m "feat: [store] add sqlite db init and migrations"
```

---

### Task 8: RunRepository

**Files:**
- Create: `src/store/runs.ts`
- Create: `tests/store/runs.test.ts`

**Interfaces:**
- Consumes: `bun:sqlite` `Database`、`openDb`（Task 7）。
- Produces:
  - `type RunStatus = "pending" | "running" | "paused" | "completed" | "rejected" | "failed"`
  - `interface Run { id; workflowName; workflowSnapshot; status; inputs; context; currentStageIndex; createdAt; updatedAt }`（`inputs`/`context` 為已解析的 `Record<string,string>`；時間戳為 ISO 字串）
  - `class RunRepository`：
    - `create(input: { id?: string; workflowName: string; workflowSnapshot: string; inputs: Record<string,string>; context: Record<string,string>; status?: RunStatus; currentStageIndex?: number }): Run`（`id` 省略時用 `crypto.randomUUID()`；`status` 預設 `"pending"`；`currentStageIndex` 預設 0）
    - `get(id: string): Run | null`
    - `list(): Run[]`（依 `created_at` 反序）
    - `updateStatus(id: string, status: RunStatus): void`
    - `updateContext(id: string, context: Record<string,string>): void`
    - `updateStageIndex(id: string, index: number): void`
  - 每次寫入更新 `updated_at`。

- [ ] **Step 1: 寫失敗測試**

```ts
// tests/store/runs.test.ts
import { test, expect } from "bun:test";
import { openDb } from "../../src/store/db";
import { RunRepository } from "../../src/store/runs";

function repo() {
  return new RunRepository(openDb(":memory:"));
}

test("create 產生 id 並可 get 回來", () => {
  const runs = repo();
  const run = runs.create({
    workflowName: "demo",
    workflowSnapshot: "name: demo",
    inputs: { topic: "Bun" },
    context: { topic: "Bun" },
  });
  expect(run.id).toBeString();
  expect(run.status).toBe("pending");
  expect(run.currentStageIndex).toBe(0);

  const got = runs.get(run.id)!;
  expect(got.inputs).toEqual({ topic: "Bun" });
  expect(got.context).toEqual({ topic: "Bun" });
  expect(got.workflowName).toBe("demo");
});

test("get 不存在回 null", () => {
  expect(repo().get("nope")).toBeNull();
});

test("updateStatus / updateContext / updateStageIndex 生效", () => {
  const runs = repo();
  const run = runs.create({
    workflowName: "demo", workflowSnapshot: "x", inputs: {}, context: {},
  });
  runs.updateStatus(run.id, "running");
  runs.updateContext(run.id, { a: "1" });
  runs.updateStageIndex(run.id, 2);

  const got = runs.get(run.id)!;
  expect(got.status).toBe("running");
  expect(got.context).toEqual({ a: "1" });
  expect(got.currentStageIndex).toBe(2);
});

test("list 依建立時間反序", () => {
  const runs = repo();
  const a = runs.create({ id: "a", workflowName: "d", workflowSnapshot: "x", inputs: {}, context: {} });
  const b = runs.create({ id: "b", workflowName: "d", workflowSnapshot: "x", inputs: {}, context: {} });
  const ids = runs.list().map((r) => r.id);
  expect(ids).toContain(a.id);
  expect(ids).toContain(b.id);
  expect(ids).toHaveLength(2);
});
```

- [ ] **Step 2: 執行測試確認失敗**

Run: `bun test tests/store/runs.test.ts`
Expected: FAIL（`Cannot find module '../../src/store/runs'`）。

- [ ] **Step 3: 寫最小實作**

```ts
// src/store/runs.ts
import type { Database } from "bun:sqlite";

export type RunStatus =
  | "pending"
  | "running"
  | "paused"
  | "completed"
  | "rejected"
  | "failed";

export interface Run {
  id: string;
  workflowName: string;
  workflowSnapshot: string;
  status: RunStatus;
  inputs: Record<string, string>;
  context: Record<string, string>;
  currentStageIndex: number;
  createdAt: string;
  updatedAt: string;
}

interface RunRow {
  id: string;
  workflow_name: string;
  workflow_snapshot: string;
  status: string;
  inputs: string;
  context: string;
  current_stage_index: number;
  created_at: string;
  updated_at: string;
}

function toRun(row: RunRow): Run {
  return {
    id: row.id,
    workflowName: row.workflow_name,
    workflowSnapshot: row.workflow_snapshot,
    status: row.status as RunStatus,
    inputs: JSON.parse(row.inputs),
    context: JSON.parse(row.context),
    currentStageIndex: row.current_stage_index,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export class RunRepository {
  constructor(private db: Database) {}

  create(input: {
    id?: string;
    workflowName: string;
    workflowSnapshot: string;
    inputs: Record<string, string>;
    context: Record<string, string>;
    status?: RunStatus;
    currentStageIndex?: number;
  }): Run {
    const now = new Date().toISOString();
    const id = input.id ?? crypto.randomUUID();
    this.db
      .query(
        `INSERT INTO runs
          (id, workflow_name, workflow_snapshot, status, inputs, context, current_stage_index, created_at, updated_at)
         VALUES ($id, $name, $snapshot, $status, $inputs, $context, $idx, $created, $updated)`,
      )
      .run({
        id,
        name: input.workflowName,
        snapshot: input.workflowSnapshot,
        status: input.status ?? "pending",
        inputs: JSON.stringify(input.inputs),
        context: JSON.stringify(input.context),
        idx: input.currentStageIndex ?? 0,
        created: now,
        updated: now,
      });
    return this.get(id)!;
  }

  get(id: string): Run | null {
    const row = this.db.query("SELECT * FROM runs WHERE id = $id").get({ id }) as RunRow | null;
    return row ? toRun(row) : null;
  }

  list(): Run[] {
    const rows = this.db.query("SELECT * FROM runs ORDER BY created_at DESC").all() as RunRow[];
    return rows.map(toRun);
  }

  updateStatus(id: string, status: RunStatus): void {
    this.db
      .query("UPDATE runs SET status = $status, updated_at = $now WHERE id = $id")
      .run({ id, status, now: new Date().toISOString() });
  }

  updateContext(id: string, context: Record<string, string>): void {
    this.db
      .query("UPDATE runs SET context = $context, updated_at = $now WHERE id = $id")
      .run({ id, context: JSON.stringify(context), now: new Date().toISOString() });
  }

  updateStageIndex(id: string, index: number): void {
    this.db
      .query("UPDATE runs SET current_stage_index = $idx, updated_at = $now WHERE id = $id")
      .run({ id, idx: index, now: new Date().toISOString() });
  }
}
```

- [ ] **Step 4: 執行測試確認通過**

Run: `bun test tests/store/runs.test.ts`
Expected: PASS（4 tests passing）。

- [ ] **Step 5: Commit**

```bash
git add src/store/runs.ts tests/store/runs.test.ts
git commit -m "feat: [store] add RunRepository"
```

---

### Task 9: StepRepository

**Files:**
- Create: `src/store/steps.ts`
- Create: `tests/store/steps.test.ts`

**Interfaces:**
- Consumes: `bun:sqlite` `Database`、`openDb`、`RunRepository`（建立 fk 依賴的 run）。
- Produces:
  - `type StepStatus = "running" | "completed" | "failed"`
  - `interface StepRecord { id; runId; stageId; prompt; output: string | null; status: StepStatus; error: string | null; startedAt: string; endedAt: string | null }`
  - `class StepRepository`：
    - `create(input: { runId: string; stageId: string; prompt: string }): StepRecord`（status=`running`、`startedAt`=now）
    - `complete(id: string, output: string): void`（status=`completed`、寫 output、`endedAt`=now）
    - `fail(id: string, error: string): void`（status=`failed`、寫 error、`endedAt`=now）
    - `listByRun(runId: string): StepRecord[]`（依 `started_at` 正序）

- [ ] **Step 1: 寫失敗測試**

```ts
// tests/store/steps.test.ts
import { test, expect } from "bun:test";
import { openDb } from "../../src/store/db";
import { RunRepository } from "../../src/store/runs";
import { StepRepository } from "../../src/store/steps";

function setup() {
  const db = openDb(":memory:");
  const runs = new RunRepository(db);
  const run = runs.create({ workflowName: "d", workflowSnapshot: "x", inputs: {}, context: {} });
  return { steps: new StepRepository(db), runId: run.id };
}

test("create 建立 running step", () => {
  const { steps, runId } = setup();
  const step = steps.create({ runId, stageId: "s1", prompt: "hi" });
  expect(step.status).toBe("running");
  expect(step.startedAt).toBeString();
  expect(step.endedAt).toBeNull();
});

test("complete 標記完成並寫 output", () => {
  const { steps, runId } = setup();
  const step = steps.create({ runId, stageId: "s1", prompt: "hi" });
  steps.complete(step.id, "結果");
  const got = steps.listByRun(runId)[0];
  expect(got.status).toBe("completed");
  expect(got.output).toBe("結果");
  expect(got.endedAt).toBeString();
});

test("fail 標記失敗並寫 error", () => {
  const { steps, runId } = setup();
  const step = steps.create({ runId, stageId: "s1", prompt: "hi" });
  steps.fail(step.id, "炸了");
  const got = steps.listByRun(runId)[0];
  expect(got.status).toBe("failed");
  expect(got.error).toBe("炸了");
});

test("listByRun 依開始時間正序", () => {
  const { steps, runId } = setup();
  steps.create({ runId, stageId: "s1", prompt: "a" });
  steps.create({ runId, stageId: "s2", prompt: "b" });
  const list = steps.listByRun(runId);
  expect(list.map((s) => s.stageId)).toEqual(["s1", "s2"]);
});
```

- [ ] **Step 2: 執行測試確認失敗**

Run: `bun test tests/store/steps.test.ts`
Expected: FAIL（`Cannot find module '../../src/store/steps'`）。

- [ ] **Step 3: 寫最小實作**

```ts
// src/store/steps.ts
import type { Database } from "bun:sqlite";

export type StepStatus = "running" | "completed" | "failed";

export interface StepRecord {
  id: string;
  runId: string;
  stageId: string;
  prompt: string;
  output: string | null;
  status: StepStatus;
  error: string | null;
  startedAt: string;
  endedAt: string | null;
}

interface StepRow {
  id: string;
  run_id: string;
  stage_id: string;
  prompt: string;
  output: string | null;
  status: string;
  error: string | null;
  started_at: string;
  ended_at: string | null;
}

function toStep(row: StepRow): StepRecord {
  return {
    id: row.id,
    runId: row.run_id,
    stageId: row.stage_id,
    prompt: row.prompt,
    output: row.output,
    status: row.status as StepStatus,
    error: row.error,
    startedAt: row.started_at,
    endedAt: row.ended_at,
  };
}

export class StepRepository {
  constructor(private db: Database) {}

  create(input: { runId: string; stageId: string; prompt: string }): StepRecord {
    const id = crypto.randomUUID();
    this.db
      .query(
        `INSERT INTO steps (id, run_id, stage_id, prompt, output, status, error, started_at, ended_at)
         VALUES ($id, $runId, $stageId, $prompt, NULL, 'running', NULL, $started, NULL)`,
      )
      .run({ id, runId: input.runId, stageId: input.stageId, prompt: input.prompt, started: new Date().toISOString() });
    return this.getById(id)!;
  }

  complete(id: string, output: string): void {
    this.db
      .query("UPDATE steps SET status = 'completed', output = $output, ended_at = $now WHERE id = $id")
      .run({ id, output, now: new Date().toISOString() });
  }

  fail(id: string, error: string): void {
    this.db
      .query("UPDATE steps SET status = 'failed', error = $error, ended_at = $now WHERE id = $id")
      .run({ id, error, now: new Date().toISOString() });
  }

  listByRun(runId: string): StepRecord[] {
    const rows = this.db
      .query("SELECT * FROM steps WHERE run_id = $runId ORDER BY started_at ASC")
      .all({ runId }) as StepRow[];
    return rows.map(toStep);
  }

  private getById(id: string): StepRecord | null {
    const row = this.db.query("SELECT * FROM steps WHERE id = $id").get({ id }) as StepRow | null;
    return row ? toStep(row) : null;
  }
}
```

- [ ] **Step 4: 執行測試確認通過**

Run: `bun test tests/store/steps.test.ts`
Expected: PASS（4 tests passing）。

- [ ] **Step 5: Commit**

```bash
git add src/store/steps.ts tests/store/steps.test.ts
git commit -m "feat: [store] add StepRepository"
```

---

### Task 10: CheckpointRepository

**Files:**
- Create: `src/store/checkpoints.ts`
- Create: `tests/store/checkpoints.test.ts`

**Interfaces:**
- Consumes: `bun:sqlite` `Database`、`openDb`、`RunRepository`。
- Produces:
  - `type Decision = "pending" | "approved" | "rejected"`
  - `interface CheckpointRecord { id; runId; stageId; prompt; decision: Decision; note: string | null; decidedAt: string | null }`
  - `class CheckpointRepository`：
    - `create(input: { runId: string; stageId: string; prompt: string }): CheckpointRecord`（decision=`pending`）
    - `decide(id: string, decision: "approved" | "rejected", note?: string): void`（寫 decision/note、`decidedAt`=now）
    - `getPendingByRun(runId: string): CheckpointRecord | null`（最新一筆 pending）
    - `listByRun(runId: string): CheckpointRecord[]`

- [ ] **Step 1: 寫失敗測試**

```ts
// tests/store/checkpoints.test.ts
import { test, expect } from "bun:test";
import { openDb } from "../../src/store/db";
import { RunRepository } from "../../src/store/runs";
import { CheckpointRepository } from "../../src/store/checkpoints";

function setup() {
  const db = openDb(":memory:");
  const run = new RunRepository(db).create({ workflowName: "d", workflowSnapshot: "x", inputs: {}, context: {} });
  return { cps: new CheckpointRepository(db), runId: run.id };
}

test("create 建立 pending checkpoint", () => {
  const { cps, runId } = setup();
  const cp = cps.create({ runId, stageId: "draft", prompt: "OK 嗎？" });
  expect(cp.decision).toBe("pending");
  expect(cp.decidedAt).toBeNull();
});

test("getPendingByRun 取得未決 checkpoint", () => {
  const { cps, runId } = setup();
  cps.create({ runId, stageId: "draft", prompt: "OK 嗎？" });
  const pending = cps.getPendingByRun(runId)!;
  expect(pending.stageId).toBe("draft");
});

test("decide 後不再是 pending", () => {
  const { cps, runId } = setup();
  const cp = cps.create({ runId, stageId: "draft", prompt: "OK 嗎？" });
  cps.decide(cp.id, "approved", "看起來不錯");
  expect(cps.getPendingByRun(runId)).toBeNull();
  const got = cps.listByRun(runId)[0];
  expect(got.decision).toBe("approved");
  expect(got.note).toBe("看起來不錯");
  expect(got.decidedAt).toBeString();
});

test("listByRun 回傳全部 checkpoint", () => {
  const { cps, runId } = setup();
  cps.create({ runId, stageId: "a", prompt: "1" });
  cps.create({ runId, stageId: "b", prompt: "2" });
  expect(cps.listByRun(runId)).toHaveLength(2);
});
```

- [ ] **Step 2: 執行測試確認失敗**

Run: `bun test tests/store/checkpoints.test.ts`
Expected: FAIL（`Cannot find module '../../src/store/checkpoints'`）。

- [ ] **Step 3: 寫最小實作**

```ts
// src/store/checkpoints.ts
import type { Database } from "bun:sqlite";

export type Decision = "pending" | "approved" | "rejected";

export interface CheckpointRecord {
  id: string;
  runId: string;
  stageId: string;
  prompt: string;
  decision: Decision;
  note: string | null;
  decidedAt: string | null;
}

interface CheckpointRow {
  id: string;
  run_id: string;
  stage_id: string;
  prompt: string;
  decision: string;
  note: string | null;
  decided_at: string | null;
}

function toCheckpoint(row: CheckpointRow): CheckpointRecord {
  return {
    id: row.id,
    runId: row.run_id,
    stageId: row.stage_id,
    prompt: row.prompt,
    decision: row.decision as Decision,
    note: row.note,
    decidedAt: row.decided_at,
  };
}

export class CheckpointRepository {
  constructor(private db: Database) {}

  create(input: { runId: string; stageId: string; prompt: string }): CheckpointRecord {
    const id = crypto.randomUUID();
    this.db
      .query(
        `INSERT INTO checkpoints (id, run_id, stage_id, prompt, decision, note, decided_at)
         VALUES ($id, $runId, $stageId, $prompt, 'pending', NULL, NULL)`,
      )
      .run({ id, runId: input.runId, stageId: input.stageId, prompt: input.prompt });
    return this.getById(id)!;
  }

  decide(id: string, decision: "approved" | "rejected", note?: string): void {
    this.db
      .query("UPDATE checkpoints SET decision = $decision, note = $note, decided_at = $now WHERE id = $id")
      .run({ id, decision, note: note ?? null, now: new Date().toISOString() });
  }

  getPendingByRun(runId: string): CheckpointRecord | null {
    const row = this.db
      .query(
        "SELECT * FROM checkpoints WHERE run_id = $runId AND decision = 'pending' ORDER BY rowid DESC LIMIT 1",
      )
      .get({ runId }) as CheckpointRow | null;
    return row ? toCheckpoint(row) : null;
  }

  listByRun(runId: string): CheckpointRecord[] {
    const rows = this.db
      .query("SELECT * FROM checkpoints WHERE run_id = $runId ORDER BY rowid ASC")
      .all({ runId }) as CheckpointRow[];
    return rows.map(toCheckpoint);
  }

  private getById(id: string): CheckpointRecord | null {
    const row = this.db.query("SELECT * FROM checkpoints WHERE id = $id").get({ id }) as CheckpointRow | null;
    return row ? toCheckpoint(row) : null;
  }
}
```

- [ ] **Step 4: 執行測試確認通過**

Run: `bun test tests/store/checkpoints.test.ts`
Expected: PASS（4 tests passing）。

- [ ] **Step 5: Commit**

```bash
git add src/store/checkpoints.ts tests/store/checkpoints.test.ts
git commit -m "feat: [store] add CheckpointRepository"
```

---

### Task 11: 執行引擎 —— `startRun`

**Files:**
- Create: `src/engine/runner.ts`
- Create: `tests/engine/runner.start.test.ts`

**Interfaces:**
- Consumes: `Workflow`（Task 2）；`interpolate`/`withOutput`/`resolveInputs`/`Context`（Task 4）；`AgentDriver`（Task 5）；`RunRepository`/`Run`（Task 8）；`StepRepository`（Task 9）；`CheckpointRepository`（Task 10）。
- Produces:
  - `interface EngineDeps { runs: RunRepository; steps: StepRepository; checkpoints: CheckpointRepository; driver: AgentDriver; logger?: (msg: string) => void }`
  - `startRun(deps: EngineDeps, workflow: Workflow, inputs: Record<string,string>): Promise<Run>`
  - 內部 `executeFrom(deps, run, workflow, fromIndex): Promise<Run>`（Task 12 的 `resumeRun` 也會用；本 task 先建立並匯出供測試/後續共用）。

**執行流程（照 spec §4）：** 內插 prompt → 建 step(running) → `driver.run` → 成功寫 output 並（若有 `output`）更新 context 為**新**物件 → 失敗標 step failed、run failed 中止 → 有 checkpoint 則建 pending checkpoint、`current_stage_index` 指向**下一**階段、run paused 返回 → 全跑完 run completed。

- [ ] **Step 1: 寫失敗測試**

```ts
// tests/engine/runner.start.test.ts
import { test, expect } from "bun:test";
import { openDb } from "../../src/store/db";
import { RunRepository } from "../../src/store/runs";
import { StepRepository } from "../../src/store/steps";
import { CheckpointRepository } from "../../src/store/checkpoints";
import { MockDriver } from "../../src/driver/mock";
import { startRun, type EngineDeps } from "../../src/engine/runner";
import type { Workflow } from "../../src/schema/workflow";

function deps(driver: MockDriver): EngineDeps {
  const db = openDb(":memory:");
  return {
    runs: new RunRepository(db),
    steps: new StepRepository(db),
    checkpoints: new CheckpointRepository(db),
    driver,
  };
}

const twoStage = {
  name: "demo",
  inputs: [{ name: "topic", required: true, default: undefined }],
  stages: [
    { id: "research", agent: { prompt: "研究 {{topic}}" }, output: "notes" },
    { id: "draft", agent: { prompt: "根據 {{notes}} 撰稿" }, output: "draft" },
  ],
} as unknown as Workflow;

test("無 checkpoint 的 workflow 一路跑到 completed", async () => {
  const driver = new MockDriver([{ output: "研究結果" }, { output: "草稿" }]);
  const d = deps(driver);
  const run = await startRun(d, twoStage, { topic: "Bun" });

  expect(run.status).toBe("completed");
  expect(run.context.notes).toBe("研究結果");
  expect(run.context.draft).toBe("草稿");
  // 第二階段 prompt 應已內插第一階段 output
  expect(driver.calls[1].prompt).toBe("根據 研究結果 撰稿");
  expect(d.steps.listByRun(run.id)).toHaveLength(2);
});

test("命中 checkpoint 暫停，current_stage_index 指向下一階段", async () => {
  const wf = {
    name: "demo",
    inputs: [],
    stages: [
      { id: "draft", agent: { prompt: "寫草稿" }, output: "draft", checkpoint: { prompt: "OK 嗎？" } },
      { id: "publish", agent: { prompt: "發佈 {{draft}}" }, output: "final" },
    ],
  } as unknown as Workflow;
  const driver = new MockDriver([{ output: "草稿內容" }]);
  const d = deps(driver);
  const run = await startRun(d, wf, {});

  expect(run.status).toBe("paused");
  expect(run.currentStageIndex).toBe(1); // 指向 publish
  expect(driver.calls).toHaveLength(1); // publish 尚未執行
  const pending = d.checkpoints.getPendingByRun(run.id)!;
  expect(pending.stageId).toBe("draft");
});

test("driver 失敗 → run failed 並中止", async () => {
  const driver = new MockDriver([{ output: "", success: false }]);
  const d = deps(driver);
  const run = await startRun(d, twoStage, { topic: "Bun" });

  expect(run.status).toBe("failed");
  expect(driver.calls).toHaveLength(1); // 第二階段未跑
  const step = d.steps.listByRun(run.id)[0];
  expect(step.status).toBe("failed");
});

test("缺 required input → 擲錯", async () => {
  const driver = new MockDriver([]);
  await expect(startRun(deps(driver), twoStage, {})).rejects.toThrow(/topic/);
});
```

- [ ] **Step 2: 執行測試確認失敗**

Run: `bun test tests/engine/runner.start.test.ts`
Expected: FAIL（`Cannot find module '../../src/engine/runner'`）。

- [ ] **Step 3: 寫最小實作**

```ts
// src/engine/runner.ts
import type { Workflow } from "../schema/workflow";
import { interpolate, resolveInputs, withOutput, type Context } from "./context";
import type { AgentDriver } from "../driver/types";
import type { RunRepository, Run } from "../store/runs";
import type { StepRepository } from "../store/steps";
import type { CheckpointRepository } from "../store/checkpoints";

export interface EngineDeps {
  runs: RunRepository;
  steps: StepRepository;
  checkpoints: CheckpointRepository;
  driver: AgentDriver;
  logger?: (msg: string) => void;
}

export async function executeFrom(
  deps: EngineDeps,
  run: Run,
  workflow: Workflow,
  fromIndex: number,
): Promise<Run> {
  let context: Context = run.context;
  deps.runs.updateStatus(run.id, "running");

  for (let i = fromIndex; i < workflow.stages.length; i++) {
    const stage = workflow.stages[i];
    const { text: prompt, missing } = interpolate(stage.agent.prompt, context);
    for (const name of missing) {
      deps.logger?.(`run ${run.id}：stage "${stage.id}" 未定義變數 {{${name}}}，以空字串代入`);
    }

    const step = deps.steps.create({ runId: run.id, stageId: stage.id, prompt });
    const result = await deps.driver.run({
      prompt,
      allowedTools: stage.agent.allowedTools,
      model: stage.agent.model,
      cwd: stage.agent.cwd,
    });

    if (!result.success) {
      deps.steps.fail(step.id, `driver 回報失敗：${JSON.stringify(result.raw)}`);
      deps.runs.updateStatus(run.id, "failed");
      return deps.runs.get(run.id)!;
    }

    deps.steps.complete(step.id, result.output);
    if (stage.output) {
      context = withOutput(context, stage.output, result.output);
      deps.runs.updateContext(run.id, context);
    }

    if (stage.checkpoint) {
      deps.checkpoints.create({ runId: run.id, stageId: stage.id, prompt: stage.checkpoint.prompt });
      deps.runs.updateStageIndex(run.id, i + 1);
      deps.runs.updateStatus(run.id, "paused");
      return deps.runs.get(run.id)!;
    }

    deps.runs.updateStageIndex(run.id, i + 1);
  }

  deps.runs.updateStatus(run.id, "completed");
  return deps.runs.get(run.id)!;
}

export async function startRun(
  deps: EngineDeps,
  workflow: Workflow,
  inputs: Record<string, string>,
): Promise<Run> {
  const context = resolveInputs(workflow, inputs); // 缺 required 在此擲錯
  const run = deps.runs.create({
    workflowName: workflow.name,
    workflowSnapshot: Bun.inspect, // 佔位，下一行覆蓋
    inputs: context,
    context,
    status: "pending",
    currentStageIndex: 0,
  } as never);
  // 註：workflowSnapshot 由呼叫端（CLI，Task 14）以原始 YAML 傳入；
  // 引擎測試不依賴 snapshot，故此處於 Task 12 改為參數。見下方 Step 3.5。
  return executeFrom(deps, run, workflow, 0);
}
```

- [ ] **Step 3.5: 修正 `startRun` 的 snapshot 處理**

上一步 `startRun` 的 `workflowSnapshot` 是佔位。`resumeRun`（Task 12）需要從 snapshot 還原 workflow，因此 snapshot 必須是可重新解析的 YAML。改由呼叫端傳入原始來源文字。用以下版本取代 `startRun`：

```ts
export async function startRun(
  deps: EngineDeps,
  workflow: Workflow,
  inputs: Record<string, string>,
  source: string,
): Promise<Run> {
  const context = resolveInputs(workflow, inputs); // 缺 required 在此擲錯
  const run = deps.runs.create({
    workflowName: workflow.name,
    workflowSnapshot: source,
    inputs: context,
    context,
    status: "pending",
    currentStageIndex: 0,
  });
  return executeFrom(deps, run, workflow, 0);
}
```

同步把 Step 1 測試中所有 `startRun(d, wf, inputs)` 呼叫補上第四個參數 `source`，用該 workflow 對應的 YAML 字串（測試可用簡短 YAML，例如）：

```ts
const twoStageYaml = `
name: demo
inputs:
  - name: topic
    required: true
stages:
  - id: research
    agent: { prompt: "研究 {{topic}}" }
    output: notes
  - id: draft
    agent: { prompt: "根據 {{notes}} 撰稿" }
    output: draft
`;
// 呼叫：await startRun(d, twoStage, { topic: "Bun" }, twoStageYaml)
```

（`source` 只是被原樣存進 `workflowSnapshot`；本 task 的測試不讀它，Task 12 才會 re-parse。傳入對應 YAML 可讓 Task 15 的跨行程恢復測試真正生效。）

- [ ] **Step 4: 執行測試確認通過**

Run: `bun test tests/engine/runner.start.test.ts`
Expected: PASS（4 tests passing）。

- [ ] **Step 5: Commit**

```bash
git add src/engine/runner.ts tests/engine/runner.start.test.ts
git commit -m "feat: [engine] add startRun state machine with checkpoint pause"
```

---

### Task 12: 執行引擎 —— `resumeRun`（核可/駁回）

**Files:**
- Modify: `src/engine/runner.ts`（新增 `resumeRun`）
- Create: `tests/engine/runner.resume.test.ts`

**Interfaces:**
- Consumes: `EngineDeps`、`executeFrom`（Task 11）；`loadWorkflowFromString`（Task 3）；`Run`（Task 8）。
- Produces:
  - `resumeRun(deps: EngineDeps, runId: string, decision: { approve: boolean; note?: string }): Promise<Run>`
  - approve：對應 pending checkpoint `decide("approved")`、run→running、從 `current_stage_index` 續跑（workflow 由 `run.workflowSnapshot` re-parse 還原）。
  - reject：checkpoint `decide("rejected")`、run→rejected 終止。
  - 前置檢查：run 不存在或非 `paused` 或無 pending checkpoint → 擲明確錯誤。

- [ ] **Step 1: 寫失敗測試**

```ts
// tests/engine/runner.resume.test.ts
import { test, expect } from "bun:test";
import { openDb } from "../../src/store/db";
import { RunRepository } from "../../src/store/runs";
import { StepRepository } from "../../src/store/steps";
import { CheckpointRepository } from "../../src/store/checkpoints";
import { MockDriver } from "../../src/driver/mock";
import { startRun, resumeRun, type EngineDeps } from "../../src/engine/runner";
import { loadWorkflowFromString } from "../../src/schema/parse";

const yaml = `
name: demo
stages:
  - id: draft
    agent: { prompt: "寫草稿" }
    output: draft
    checkpoint: { prompt: "OK 嗎？" }
  - id: publish
    agent: { prompt: "發佈 {{draft}}" }
    output: final
`;

function deps(driver: MockDriver): EngineDeps {
  const db = openDb(":memory:");
  return {
    runs: new RunRepository(db),
    steps: new StepRepository(db),
    checkpoints: new CheckpointRepository(db),
    driver,
  };
}

test("approve 從下一階段續跑至 completed", async () => {
  const driver = new MockDriver([{ output: "草稿內容" }, { output: "最終稿" }]);
  const d = deps(driver);
  const { workflow } = loadWorkflowFromString(yaml);

  const paused = await startRun(d, workflow, {}, yaml);
  expect(paused.status).toBe("paused");

  const done = await resumeRun(d, paused.id, { approve: true, note: "讚" });
  expect(done.status).toBe("completed");
  expect(done.context.final).toBe("最終稿");
  // publish 階段有內插 checkpoint 前存下的 draft
  expect(driver.calls[1].prompt).toBe("發佈 草稿內容");
  const cp = d.checkpoints.listByRun(paused.id)[0];
  expect(cp.decision).toBe("approved");
  expect(cp.note).toBe("讚");
});

test("reject → run rejected 且不再續跑", async () => {
  const driver = new MockDriver([{ output: "草稿內容" }]);
  const d = deps(driver);
  const { workflow } = loadWorkflowFromString(yaml);

  const paused = await startRun(d, workflow, {}, yaml);
  const rejected = await resumeRun(d, paused.id, { approve: false, note: "重寫" });

  expect(rejected.status).toBe("rejected");
  expect(driver.calls).toHaveLength(1); // publish 未跑
  expect(d.checkpoints.listByRun(paused.id)[0].decision).toBe("rejected");
});

test("resume 非 paused 的 run → 擲錯", async () => {
  const driver = new MockDriver([]);
  const d = deps(driver);
  const run = d.runs.create({ workflowName: "demo", workflowSnapshot: yaml, inputs: {}, context: {}, status: "completed" });
  await expect(resumeRun(d, run.id, { approve: true })).rejects.toThrow(/paused/);
});

test("resume 不存在的 run → 擲錯", async () => {
  await expect(resumeRun(deps(new MockDriver([])), "nope", { approve: true })).rejects.toThrow(/找不到|not found|nope/);
});
```

- [ ] **Step 2: 執行測試確認失敗**

Run: `bun test tests/engine/runner.resume.test.ts`
Expected: FAIL（`resumeRun` is not exported / not a function）。

- [ ] **Step 3: 在 `src/engine/runner.ts` 末端新增 `resumeRun`**

```ts
import { loadWorkflowFromString } from "../schema/parse";

export async function resumeRun(
  deps: EngineDeps,
  runId: string,
  decision: { approve: boolean; note?: string },
): Promise<Run> {
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
    return deps.runs.get(runId)!;
  }

  deps.checkpoints.decide(pending.id, "approved", decision.note);
  const { workflow } = loadWorkflowFromString(run.workflowSnapshot);
  return executeFrom(deps, run, workflow, run.currentStageIndex);
}
```

（把 `loadWorkflowFromString` 的 import 併到檔案頂端既有 import 區塊。）

- [ ] **Step 4: 執行測試確認通過**

Run: `bun test tests/engine/runner.resume.test.ts`
Expected: PASS（4 tests passing）。

- [ ] **Step 5: Commit**

```bash
git add src/engine/runner.ts tests/engine/runner.resume.test.ts
git commit -m "feat: [engine] add resumeRun for approve/reject"
```

---

### Task 13: CLI input 解析與依賴組裝

**Files:**
- Create: `src/cli/inputs.ts`
- Create: `src/cli/deps.ts`
- Create: `tests/cli/inputs.test.ts`

**Interfaces:**
- Consumes: `openDb`（Task 7）、三個 Repository（Task 8–10）、`ClaudeCodeDriver`（Task 6）、`AgentDriver`（Task 5）、`EngineDeps`（Task 11）。
- Produces:
  - `parseInputPairs(pairs: string[]): Record<string,string>` —— 把 `["topic=Bun 入門", "lang=zh"]` 解析為物件（只切第一個 `=`；空陣列→`{}`；缺 `=` 擲錯）。
  - `buildDeps(opts?: { dbPath?: string; driver?: AgentDriver }): EngineDeps & { dbPath: string }` —— DB 路徑取 `opts.dbPath` → `AIPIPE_DB` 環境變數 → 預設 `./aipipe.sqlite`；driver 預設 `ClaudeCodeDriver`。

- [ ] **Step 1: 寫失敗測試**

```ts
// tests/cli/inputs.test.ts
import { test, expect } from "bun:test";
import { parseInputPairs } from "../../src/cli/inputs";
import { buildDeps } from "../../src/cli/deps";
import { MockDriver } from "../../src/driver/mock";

test("解析 k=v，值含空白與等號", () => {
  expect(parseInputPairs(["topic=Bun 入門", "eq=a=b"])).toEqual({
    topic: "Bun 入門",
    eq: "a=b",
  });
});

test("空陣列回空物件", () => {
  expect(parseInputPairs([])).toEqual({});
});

test("缺 = 擲錯", () => {
  expect(() => parseInputPairs(["bad"])).toThrow(/bad/);
});

test("buildDeps 用 :memory: 與注入 driver 組出可用 deps", () => {
  const d = buildDeps({ dbPath: ":memory:", driver: new MockDriver([]) });
  const run = d.runs.create({ workflowName: "demo", workflowSnapshot: "x", inputs: {}, context: {} });
  expect(d.runs.get(run.id)!.workflowName).toBe("demo");
});
```

- [ ] **Step 2: 執行測試確認失敗**

Run: `bun test tests/cli/inputs.test.ts`
Expected: FAIL（`Cannot find module '../../src/cli/inputs'`）。

- [ ] **Step 3: 寫最小實作**

```ts
// src/cli/inputs.ts
export function parseInputPairs(pairs: string[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const pair of pairs) {
    const eq = pair.indexOf("=");
    if (eq < 0) throw new Error(`--input 格式錯誤（需 k=v）：${pair}`);
    const key = pair.slice(0, eq);
    const value = pair.slice(eq + 1);
    if (!key) throw new Error(`--input 缺少變數名：${pair}`);
    out[key] = value;
  }
  return out;
}
```

```ts
// src/cli/deps.ts
import { openDb } from "../store/db";
import { RunRepository } from "../store/runs";
import { StepRepository } from "../store/steps";
import { CheckpointRepository } from "../store/checkpoints";
import { ClaudeCodeDriver } from "../driver/claude-code";
import type { AgentDriver } from "../driver/types";
import type { EngineDeps } from "../engine/runner";

export function buildDeps(
  opts: { dbPath?: string; driver?: AgentDriver } = {},
): EngineDeps & { dbPath: string } {
  const dbPath = opts.dbPath ?? process.env.AIPIPE_DB ?? "./aipipe.sqlite";
  const db = openDb(dbPath);
  return {
    dbPath,
    runs: new RunRepository(db),
    steps: new StepRepository(db),
    checkpoints: new CheckpointRepository(db),
    driver: opts.driver ?? new ClaudeCodeDriver(),
    logger: (msg: string) => console.error(msg),
  };
}
```

- [ ] **Step 4: 執行測試確認通過**

Run: `bun test tests/cli/inputs.test.ts`
Expected: PASS（4 tests passing）。

- [ ] **Step 5: Commit**

```bash
git add src/cli/inputs.ts src/cli/deps.ts tests/cli/inputs.test.ts
git commit -m "feat: [cli] add input parsing and dependency wiring"
```

---

### Task 14: CLI 指令與 dispatcher

**Files:**
- Create: `src/cli/commands/run.ts`
- Create: `src/cli/commands/list.ts`
- Create: `src/cli/commands/show.ts`
- Create: `src/cli/commands/approve.ts`
- Create: `src/cli/commands/reject.ts`
- Create: `src/cli/index.ts`
- Create: `tests/cli/commands.test.ts`

**Interfaces:**
- Consumes: `EngineDeps`（Task 11）、`startRun`/`resumeRun`（Task 11–12）、`loadWorkflowFile`（Task 3）、`buildDeps`/`parseInputPairs`（Task 13）、`Run`（Task 8）。
- Produces（每個 command 回傳「要印出的字串」，方便測試；由 `index.ts` 負責印出）：
  - `runCommand(deps: EngineDeps, args: { file: string; inputs: Record<string,string> }): Promise<string>`
  - `listCommand(deps: EngineDeps): string`
  - `showCommand(deps: EngineDeps, args: { runId: string }): string`
  - `approveCommand(deps: EngineDeps, args: { runId: string; note?: string }): Promise<string>`
  - `rejectCommand(deps: EngineDeps, args: { runId: string; note?: string }): Promise<string>`
  - `formatRunStatus(deps, run): string`（共用：印 run 狀態；若 paused 附上 checkpoint prompt 與核可提示）
  - `src/cli/index.ts`：`main(argv: string[]): Promise<void>` 用 `parseArgs` 分派子指令，並在檔案為進入點時執行。

- [ ] **Step 1: 寫失敗測試**

```ts
// tests/cli/commands.test.ts
import { test, expect } from "bun:test";
import { buildDeps } from "../../src/cli/deps";
import { MockDriver } from "../../src/driver/mock";
import { runCommand } from "../../src/cli/commands/run";
import { listCommand } from "../../src/cli/commands/list";
import { showCommand } from "../../src/cli/commands/show";
import { approveCommand } from "../../src/cli/commands/approve";
import { rejectCommand } from "../../src/cli/commands/reject";

const wfPath = new URL("./fixtures/checkpoint.yaml", import.meta.url).pathname;

// 用一個共享的 in-memory DB，讓 run 後能 approve（同一連線）
function ctx(driver: MockDriver) {
  return buildDeps({ dbPath: ":memory:", driver });
}

test("run 命中 checkpoint → 輸出含 paused 與 checkpoint prompt", async () => {
  const deps = ctx(new MockDriver([{ output: "草稿內容" }]));
  const out = await runCommand(deps, { file: wfPath, inputs: {} });
  expect(out).toContain("paused");
  expect(out).toContain("OK 嗎？"); // checkpoint prompt
  expect(out).toContain("approve"); // 提示核可指令
});

test("list 顯示 run 與狀態", async () => {
  const deps = ctx(new MockDriver([{ output: "草稿內容" }]));
  await runCommand(deps, { file: wfPath, inputs: {} });
  const out = listCommand(deps);
  expect(out).toContain("paused");
  expect(out).toContain("demo");
});

test("approve 續跑到 completed；show 顯示步驟", async () => {
  const deps = ctx(new MockDriver([{ output: "草稿內容" }, { output: "最終稿" }]));
  const runOut = await runCommand(deps, { file: wfPath, inputs: {} });
  const runId = deps.runs.list()[0].id;

  const approveOut = await approveCommand(deps, { runId, note: "讚" });
  expect(approveOut).toContain("completed");

  const showOut = showCommand(deps, { runId });
  expect(showOut).toContain("draft");   // stage id
  expect(showOut).toContain("publish");
  expect(showOut).toContain("completed");
  expect(runOut).toContain("paused");
});

test("reject 終止 run", async () => {
  const deps = ctx(new MockDriver([{ output: "草稿內容" }]));
  await runCommand(deps, { file: wfPath, inputs: {} });
  const runId = deps.runs.list()[0].id;
  const out = await rejectCommand(deps, { runId, note: "重寫" });
  expect(out).toContain("rejected");
});
```

也建立測試用 fixture：

```yaml
# tests/cli/fixtures/checkpoint.yaml
name: demo
stages:
  - id: draft
    agent: { prompt: "寫草稿" }
    output: draft
    checkpoint: { prompt: "OK 嗎？" }
  - id: publish
    agent: { prompt: "發佈 {{draft}}" }
    output: final
```

- [ ] **Step 2: 執行測試確認失敗**

Run: `bun test tests/cli/commands.test.ts`
Expected: FAIL（`Cannot find module '../../src/cli/commands/run'`）。

- [ ] **Step 3: 寫最小實作 —— 共用格式化 + 五個指令**

```ts
// src/cli/commands/format.ts
import type { EngineDeps } from "../../engine/runner";
import type { Run } from "../../store/runs";

export function formatRunStatus(deps: EngineDeps, run: Run): string {
  const lines = [`Run ${run.id}`, `工作流：${run.workflowName}`, `狀態：${run.status}`];
  if (run.status === "paused") {
    const pending = deps.checkpoints.getPendingByRun(run.id);
    if (pending) {
      lines.push(`檢查點（stage ${pending.stageId}）：${pending.prompt}`);
      lines.push(`核可請執行：aipipe approve ${run.id}`);
      lines.push(`駁回請執行：aipipe reject ${run.id}`);
    }
  }
  return lines.join("\n");
}
```

```ts
// src/cli/commands/run.ts
import type { EngineDeps } from "../../engine/runner";
import { startRun } from "../../engine/runner";
import { loadWorkflowFile } from "../../schema/parse";
import { formatRunStatus } from "./format";

export async function runCommand(
  deps: EngineDeps,
  args: { file: string; inputs: Record<string, string> },
): Promise<string> {
  const source = await Bun.file(args.file).text();
  const { workflow, warnings } = await loadWorkflowFile(args.file);
  for (const w of warnings) deps.logger?.(`警告：${w}`);
  const run = await startRun(deps, workflow, args.inputs, source);
  return formatRunStatus(deps, run);
}
```

```ts
// src/cli/commands/list.ts
import type { EngineDeps } from "../../engine/runner";

export function listCommand(deps: EngineDeps): string {
  const runs = deps.runs.list();
  if (runs.length === 0) return "（尚無任何 run）";
  return runs
    .map((r) => `${r.id}\t${r.status}\t${r.workflowName}\t${r.updatedAt}`)
    .join("\n");
}
```

```ts
// src/cli/commands/show.ts
import type { EngineDeps } from "../../engine/runner";

export function showCommand(deps: EngineDeps, args: { runId: string }): string {
  const run = deps.runs.get(args.runId);
  if (!run) return `找不到 run：${args.runId}`;
  const lines = [
    `Run ${run.id}`,
    `工作流：${run.workflowName}`,
    `狀態：${run.status}`,
    `目前階段索引：${run.currentStageIndex}`,
    `context：${JSON.stringify(run.context)}`,
    "",
    "步驟：",
  ];
  for (const s of deps.steps.listByRun(run.id)) {
    lines.push(`  [${s.status}] ${s.stageId}`);
    if (s.output) lines.push(`     output：${s.output}`);
    if (s.error) lines.push(`     error：${s.error}`);
  }
  const cps = deps.checkpoints.listByRun(run.id);
  if (cps.length) {
    lines.push("", "檢查點：");
    for (const c of cps) lines.push(`  [${c.decision}] ${c.stageId}：${c.prompt}`);
  }
  return lines.join("\n");
}
```

```ts
// src/cli/commands/approve.ts
import type { EngineDeps } from "../../engine/runner";
import { resumeRun } from "../../engine/runner";
import { formatRunStatus } from "./format";

export async function approveCommand(
  deps: EngineDeps,
  args: { runId: string; note?: string },
): Promise<string> {
  const run = await resumeRun(deps, args.runId, { approve: true, note: args.note });
  return formatRunStatus(deps, run);
}
```

```ts
// src/cli/commands/reject.ts
import type { EngineDeps } from "../../engine/runner";
import { resumeRun } from "../../engine/runner";
import { formatRunStatus } from "./format";

export async function rejectCommand(
  deps: EngineDeps,
  args: { runId: string; note?: string },
): Promise<string> {
  const run = await resumeRun(deps, args.runId, { approve: false, note: args.note });
  return formatRunStatus(deps, run);
}
```

- [ ] **Step 4: 執行 command 測試確認通過**

Run: `bun test tests/cli/commands.test.ts`
Expected: PASS（4 tests passing）。

- [ ] **Step 5: 寫 dispatcher `src/cli/index.ts`**

```ts
// src/cli/index.ts
import { parseArgs } from "node:util";
import { buildDeps } from "./deps";
import { parseInputPairs } from "./inputs";
import { runCommand } from "./commands/run";
import { listCommand } from "./commands/list";
import { showCommand } from "./commands/show";
import { approveCommand } from "./commands/approve";
import { rejectCommand } from "./commands/reject";

const USAGE = `用法：
  aipipe run <workflow.yaml> --input k=v [--input k=v ...]
  aipipe list
  aipipe show <runId>
  aipipe approve <runId> [--note "..."]
  aipipe reject <runId> [--note "..."]`;

export async function main(argv: string[]): Promise<void> {
  const { values, positionals } = parseArgs({
    args: argv,
    allowPositionals: true,
    options: {
      input: { type: "string", multiple: true },
      note: { type: "string" },
    },
  });
  const [command, target] = positionals;
  const deps = buildDeps();

  switch (command) {
    case "run": {
      if (!target) throw new Error("run 需要 <workflow.yaml>");
      const inputs = parseInputPairs((values.input as string[]) ?? []);
      console.log(await runCommand(deps, { file: target, inputs }));
      break;
    }
    case "list":
      console.log(listCommand(deps));
      break;
    case "show":
      if (!target) throw new Error("show 需要 <runId>");
      console.log(showCommand(deps, { runId: target }));
      break;
    case "approve":
      if (!target) throw new Error("approve 需要 <runId>");
      console.log(await approveCommand(deps, { runId: target, note: values.note as string | undefined }));
      break;
    case "reject":
      if (!target) throw new Error("reject 需要 <runId>");
      console.log(await rejectCommand(deps, { runId: target, note: values.note as string | undefined }));
      break;
    default:
      console.log(USAGE);
      process.exitCode = command ? 1 : 0;
  }
}

if (import.meta.main) {
  main(Bun.argv.slice(2)).catch((err) => {
    console.error(`錯誤：${err instanceof Error ? err.message : String(err)}`);
    process.exitCode = 1;
  });
}
```

- [ ] **Step 6: 手動驗證 dispatcher（無參數印用法）**

Run: `bun run src/cli/index.ts`
Expected: 印出以 `用法：` 開頭的說明，行程結束碼 0。

- [ ] **Step 7: Commit**

```bash
git add src/cli/commands tests/cli/commands.test.ts tests/cli/fixtures src/cli/index.ts
git commit -m "feat: [cli] add run/list/show/approve/reject commands and dispatcher"
```

---

### Task 15: 範例工作流與端到端整合測試

**Files:**
- Create: `workflows/write-blog-post.yaml`
- Create: `tests/integration/quest.test.ts`

**Interfaces:**
- Consumes: `buildDeps`（Task 13）、`runCommand`/`approveCommand`/`rejectCommand`/`showCommand`（Task 14）、`MockDriver`（Task 5）、`loadWorkflowFile`（Task 3）。
- Produces: 驗證核心驗收目標 `YAML → 逐階段執行 → 命中檢查點暫停 → CLI 核可 → 續跑至完成`，以及 reject 與 driver 失敗路徑；並驗證「跨行程恢復」（用兩個各自開同一 sqlite **檔案** 的 deps）。

- [ ] **Step 1: 寫範例工作流**

```yaml
# workflows/write-blog-post.yaml
name: write-blog-post
description: 研究主題並產出部落格草稿
inputs:
  - name: topic
    required: true
stages:
  - id: research
    name: 蒐集資料
    agent:
      prompt: "研究主題「{{topic}}」，整理三個重點"
      allowedTools: [WebSearch, Read]
    output: research_notes
  - id: draft
    name: 撰寫草稿
    agent:
      prompt: "根據以下筆記寫一篇草稿：\n{{research_notes}}"
    output: draft
    checkpoint:
      prompt: "草稿看起來 OK 嗎？核可後才發佈"
  - id: publish
    name: 發佈
    agent:
      prompt: "把這篇草稿整理成最終格式：\n{{draft}}"
    output: final
```

- [ ] **Step 2: 寫失敗的整合測試**

```ts
// tests/integration/quest.test.ts
import { test, expect } from "bun:test";
import { buildDeps } from "../../src/cli/deps";
import { MockDriver } from "../../src/driver/mock";
import { runCommand } from "../../src/cli/commands/run";
import { approveCommand } from "../../src/cli/commands/approve";
import { rejectCommand } from "../../src/cli/commands/reject";
import { loadWorkflowFile } from "../../src/schema/parse";
import { startRun, resumeRun, type EngineDeps } from "../../src/engine/runner";

const wfPath = new URL("../../workflows/write-blog-post.yaml", import.meta.url).pathname;

test("範例 YAML 通過載入驗證且無警告", async () => {
  const { workflow, warnings } = await loadWorkflowFile(wfPath);
  expect(workflow.name).toBe("write-blog-post");
  expect(warnings).toEqual([]);
});

test("核心驗收路徑：run → paused → approve → completed", async () => {
  const deps = buildDeps({
    dbPath: ":memory:",
    driver: new MockDriver([
      { output: "重點一二三" },
      { output: "一篇草稿" },
      { output: "最終格式" },
    ]),
  });

  const runOut = await runCommand(deps, { file: wfPath, inputs: { topic: "Bun 入門" } });
  expect(runOut).toContain("paused");

  const runId = deps.runs.list()[0].id;
  const approveOut = await approveCommand(deps, { runId });
  expect(approveOut).toContain("completed");

  const run = deps.runs.get(runId)!;
  expect(run.context.final).toBe("最終格式");
  expect(deps.steps.listByRun(runId)).toHaveLength(3);
});

test("reject 路徑：run → paused → reject → rejected", async () => {
  const deps = buildDeps({
    dbPath: ":memory:",
    driver: new MockDriver([{ output: "重點" }, { output: "草稿" }]),
  });
  await runCommand(deps, { file: wfPath, inputs: { topic: "x" } });
  const runId = deps.runs.list()[0].id;
  const out = await rejectCommand(deps, { runId, note: "不行" });
  expect(out).toContain("rejected");
});

test("driver 失敗路徑：第一階段失敗 → failed", async () => {
  const deps = buildDeps({
    dbPath: ":memory:",
    driver: new MockDriver([{ output: "", success: false }]),
  });
  const out = await runCommand(deps, { file: wfPath, inputs: { topic: "x" } });
  expect(out).toContain("failed");
});

test("跨行程恢復：不同 deps 各開同一 sqlite 檔案，approve 後仍續跑", async () => {
  const dbFile = `/tmp/aipipe-test-${crypto.randomUUID()}.sqlite`;

  // 「行程 A」：起跑到 checkpoint
  const depsA: EngineDeps = buildDeps({
    dbPath: dbFile,
    driver: new MockDriver([{ output: "重點" }, { output: "草稿" }]),
  });
  const { workflow } = await loadWorkflowFile(wfPath);
  const source = await Bun.file(wfPath).text();
  const paused = await startRun(depsA, workflow, { topic: "x" }, source);
  expect(paused.status).toBe("paused");

  // 「行程 B」：全新 deps（新 driver、重新開檔），只靠 SQLite 狀態恢復
  const depsB: EngineDeps = buildDeps({
    dbPath: dbFile,
    driver: new MockDriver([{ output: "最終" }]),
  });
  const done = await resumeRun(depsB, paused.id, { approve: true });
  expect(done.status).toBe("completed");
  expect(done.context.final).toBe("最終");
});
```

- [ ] **Step 3: 執行整合測試確認通過**

Run: `bun test tests/integration/quest.test.ts`
Expected: PASS（5 tests passing）。

- [ ] **Step 4: 執行全套測試與覆蓋率**

Run: `bun test --coverage`
Expected: 所有測試 PASS；`src/` 整體行覆蓋率 ≥ 80%。若某檔偏低，補該檔的邊界測試再跑一次。

- [ ] **Step 5: Commit**

```bash
git add workflows/write-blog-post.yaml tests/integration/quest.test.ts
git commit -m "test: [integration] add example workflow and end-to-end quest tests"
```

---

## Self-Review

**1. Spec coverage**

| Spec 區段 | 對應 Task |
|-----------|-----------|
| §3 A. Workflow Schema（zod 欄位、kebab-case、stages≥1、各欄位） | Task 2 |
| §3 驗證規則（id 唯一、output 不重複/不撞 input、未定義變數警告、載入失敗擲錯） | Task 3 |
| §4 B. 執行引擎狀態機、`startRun`、逐階段流程、checkpoint 暫停、失敗中止 | Task 11 |
| §4 `resumeRun`（approve/reject、從 snapshot 恢復） | Task 12 |
| §4 不靠長駐記憶體、跨行程恢復 | Task 12 + Task 15（跨行程測試） |
| §5 C. AgentDriver 介面、ClaudeCodeDriver（spawn、json 解析、失敗處理）、MockDriver | Task 5、Task 6 |
| §6 D. 持久化 db.ts migrations、runs/steps/checkpoints 三表、三個 Repository、ISO 8601、YAML 快照 | Task 7–10（快照寫入於 Task 11 `startRun` 的 `source` 參數） |
| §7 E. CLI run/list/show/approve/reject、`--input k=v` 可重複、缺 required 報錯、paused 印 checkpoint 提示、`parseArgs` | Task 13、Task 14 |
| §8 F. 檔案結構、測試策略（單元/整合/可跳過 smoke）、慣例（不可變、邊界驗證） | 全部 task；smoke = Task 6；整合 = Task 15 |
| §8 範例 YAML write-blog-post.yaml | Task 15 |

所有 spec 區段皆有對應 task，無缺口。（§9 開放項為後續子專案，明確 out of scope，不列入。）

**2. Placeholder scan**

已檢查全計畫：每個 code step 均含完整可執行程式碼與測試；每個 run step 均含確切指令與預期輸出。Task 11 Step 3 曾出現的 `Bun.inspect` 佔位，已在同 task 的 Step 3.5 明確以 `source` 參數版本取代並說明理由 —— 這是刻意的兩段式教學，不是遺留 placeholder。無 TBD/TODO/「類似 Task N」等紅旗。

**3. Type consistency**

- `EngineDeps` 於 Task 11 定義，Task 12–14 一致引用（未改名）。
- store 型別 `Run` / `StepRecord` / `CheckpointRecord` 與 schema 型別 `Workflow` / `Stage` / `Checkpoint` 命名分離，無撞名。
- `startRun(deps, workflow, inputs, source)` 四參數版（Task 11 Step 3.5 定案）在 Task 14 `runCommand` 與 Task 15 測試中一致使用；`resumeRun(deps, runId, { approve, note })` 簽章 Task 12/14/15 一致。
- driver：`AgentDriver.run`、`DriverInput`、`DriverResult`、`MockResponse`、`ProcRunner` 在 Task 5/6/11/13 一致。
- Repository 方法名（`create`/`get`/`list`/`updateStatus`/`updateContext`/`updateStageIndex`；`complete`/`fail`/`listByRun`；`decide`/`getPendingByRun`/`listByRun`）與 spec §6 完全對齊，且引擎 Task 11–12 呼叫一致。

計畫自我檢查通過，無需修改。
