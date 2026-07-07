# AIPipe — 子專案 1：Quest Engine 核心 設計規格

- 日期：2026-07-07
- 狀態：已核可，待進入實作計畫
- 範圍：整體平台的第一個垂直薄切片（純後端 + 極簡 CLI，無 Web UI）

---

## 1. 專案背景（整體藍圖）

AIPipe 是一個「類 n8n」的工作流平台，由 AI agent（Claude Code headless）驅動執行。
最終願景是一個 SNES RPG「勇者大廳」風格的 Web 介面：使用者發佈任務，任務透過宣告式工作流由
AI agent 逐步遞進，並在宣告的檢查點暫停等待人類核可。

### 定位與決策（brainstorming 結論）

| 主題 | 決策 |
|------|------|
| 使用者與規模 | 小團隊自架（單機/內網），需基本多人與權限 |
| 工作流定義 | 宣告式設定檔（YAML/JSON），Web 負責觸發與監控 |
| AI 驅動 | Claude Code headless（`claude` CLI 子行程）；未來以 driver 抽象加 Codex |
| 人在環中 | 設定檔預先宣告檢查點，引擎跑到即暫停，人核可/駁回後續跑 |
| RPG 介面 | 目標為完整沉浸式大廳；素材（像素圖/對話框/音效等）由使用者自行生成，設計須附素材清單 |
| 技術棧 | Bun + TypeScript 後端、React/Vite 前端、`bun:sqlite` 持久化、spawn `claude` CLI 當驅動 |

### 七個子系統與 RPG 隱喻

| # | 子系統 | RPG 隱喻 | 職責 |
|---|--------|---------|------|
| 1 | Workflow Schema & Parser | 任務卷軸格式 | YAML/JSON 定義 + zod 驗證 |
| 2 | Execution Engine（Quest Runner） | 任務執行 | 狀態機、逐階段喚起 Claude、檢查點暫停/恢復、持久化 |
| 3 | AI Driver Layer | 召喚勇者 | 薄轉接層 spawn `claude -p`，回傳結構化結果 |
| 4 | Persistence / Run Store | 冒險記錄 | `bun:sqlite`：工作流快照、runs、steps、checkpoints |
| 5 | API / Backend Server | 大廳櫃檯 | HTTP + SSE：觸發、列表、核可、即時推播 |
| 6 | CLI | 密令 | 終端機觸發與查詢 |
| 7 | Web UI（勇者大廳） | 大廳本體 | RPG 主題前端 |

### 建置順序

- **子專案 1（本文件）— Quest Engine 核心**：子系統 1+2+3+4 + 極簡 CLI（6 的最小子集）。純後端、可測試、無 UI。
- 子專案 2 — API + 即時串流（子系統 5）。
- 子專案 3 — 勇者大廳 Web UI（子系統 7）+ 素材清單。

各子專案各自走 設計 → 計畫 → 實作 循環。

---

## 2. 子專案 1 範圍

**In scope**：工作流 schema 與載入驗證、可恢復的執行引擎狀態機、Claude Code driver 與 Mock driver、
`bun:sqlite` 持久化、極簡 CLI（run/list/show/approve/reject）。

**Out of scope（後續子專案）**：HTTP API、SSE 即時串流、Web UI、RPG 素材、多驅動（Codex）、
排程/webhook 觸發、帳號與權限系統、agent 自主發問（僅做設定檔宣告檢查點）。

**核心驗收目標**：跑通 `YAML → 引擎逐階段執行 → 命中檢查點暫停 → CLI 核可 → 續跑至完成`。

---

## 3. A. 工作流 Schema（任務卷軸）

一份 YAML 定義一個工作流。頂層 `name`、`description`、`inputs`（觸發時帶入的變數）、
`stages`（依序執行）。每個 stage 有 `agent`（prompt + 可用工具），可選 `checkpoint`（此階段後暫停），
輸出存進 `output` 變數供後續以 `{{var}}` 引用。

```yaml
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

### 欄位定義（zod 驗證）

- **workflow**
  - `name: string`（必填，kebab-case，作識別）
  - `description?: string`
  - `inputs?: InputDef[]`
  - `stages: Stage[]`（至少 1）
- **InputDef**
  - `name: string`（必填）
  - `required?: boolean`（預設 false）
  - `default?: string`
- **Stage**
  - `id: string`（必填，工作流內唯一）
  - `name?: string`（人類可讀，UI 顯示用）
  - `agent: AgentSpec`（必填）
  - `output?: string`（變數名；省略則不存 context，僅記 log）
  - `checkpoint?: Checkpoint`
- **AgentSpec**
  - `prompt: string`（必填，支援 `{{var}}` 內插）
  - `allowedTools?: string[]`（傳給 `claude --allowedTools`）
  - `model?: string`（省略則用 driver 預設）
  - `cwd?: string`（agent 執行工作目錄，預設 run 的工作目錄）
- **Checkpoint**
  - `prompt: string`（顯示給核可者的說明）

### 驗證規則（載入邊界）

- `stages[].id` 全域唯一。
- `output` 變數名不得重複、不得與 input 名衝突。
- `{{var}}` 內若引用未定義變數 → 載入時警告（非致命；執行時未解析則以空字串代入並記 log）。
- 驗證失敗擲出帶明確訊息的錯誤，不進入執行。

---

## 4. B. 執行引擎（Quest Runner）— 可恢復狀態機

### Run 狀態

```
pending → running → paused（命中 checkpoint）
paused → running（approve）→ ... → completed
paused → rejected（reject）
running → failed（driver 或內部錯誤）
```

### 關鍵設計：不靠長駐記憶體等待

引擎跑到 checkpoint 就把狀態持久化到 SQLite 然後**返回**；核可是獨立指令，載入 run 從下一階段續跑。
如此暫停可撐數小時/數天，且行程崩潰可復原。

### 介面

```ts
// 逐階段執行：內插 prompt → driver.run → 輸出存 context → 每階段結束立即持久化。
// 命中 checkpoint 存成 paused 返回；全部跑完存 completed。
startRun(workflow: Workflow, inputs: Record<string, string>): Promise<Run>

// 載入 run，套用核可/駁回：approved → 從 current_stage_index 續跑；rejected → 標 rejected 終止。
resumeRun(runId: string, decision: { approve: boolean; note?: string }): Promise<Run>
```

### 逐階段執行流程

1. 以 context（inputs + 先前 outputs）內插 stage.agent.prompt。
2. 建立 step 記錄（status=running），呼叫 `driver.run(...)`。
3. 成功 → step.output 寫入、status=completed；若有 `output` 則寫入 context（回傳**新** context 物件，不原地改）。
4. 失敗 → step.status=failed 記 error，run.status=failed，中止並回報。
5. 若該 stage 有 checkpoint → 建立 checkpoint 記錄（decision=pending），run.status=paused、
   current_stage_index 指向**下一**階段，持久化後返回。
6. 全部階段完成 → run.status=completed。

`resumeRun` 的 approve：把對應 checkpoint decision=approved，run.status=running，從 current_stage_index 續跑。
reject：checkpoint decision=rejected，run.status=rejected，不再續跑。

---

## 5. C. AI Driver Layer（召喚勇者）

薄介面，未來好加 Codex：

```ts
interface DriverInput {
  prompt: string
  allowedTools?: string[]
  model?: string
  cwd?: string
}
interface DriverResult {
  output: string     // agent 最終文字輸出
  success: boolean
  raw: unknown       // 原始解析結果，供除錯
}
interface AgentDriver {
  run(input: DriverInput): Promise<DriverResult>
}
```

- **ClaudeCodeDriver**：用 `Bun.spawn` 跑
  `claude -p <prompt> --output-format json [--allowedTools ...] [--model ...]`，
  於 `cwd` 執行，抓 stdout 解析 JSON 取最終結果文字。非零退出或解析失敗 → `success:false`。
  （即時串流 `--output-format stream-json` 留待子專案 2 的 SSE；此處僅取最終結果。）
- **MockDriver**：測試用，依 prompt/序列回傳預錄輸出，可模擬成功與失敗。

---

## 6. D. 持久化 / Run Store（冒險記錄）

`bun:sqlite`，Repository 模式。工作流以磁碟 YAML 檔為主；run 建立時把 YAML **快照**存入 run
（之後改檔不污染歷史）。

### 資料表

- **runs**：`id`(uuid), `workflow_name`, `workflow_snapshot`(yaml text), `status`,
  `inputs`(json), `context`(json), `current_stage_index`(int), `created_at`, `updated_at`
- **steps**：`id`, `run_id`(fk), `stage_id`, `prompt`, `output`, `status`, `error`,
  `started_at`, `ended_at`
- **checkpoints**：`id`, `run_id`(fk), `stage_id`, `prompt`, `decision`(pending/approved/rejected),
  `note`, `decided_at`

### Repository（每檔一責）

- `RunRepository`：create / get / list / updateStatus / updateContext / updateStageIndex
- `StepRepository`：create / complete / fail / listByRun
- `CheckpointRepository`：create / decide / getPendingByRun / listByRun

`db.ts` 負責初始化與 migration（建表）。所有時間戳以 ISO 8601 字串儲存。

---

## 7. E. CLI（密令）

```
aipipe run <workflow.yaml> --input topic="Bun 入門"   # 觸發，跑到檢查點或完成
aipipe list                                          # 列出所有 run 與狀態
aipipe show <runId>                                  # run 細節 + 各步驟 log
aipipe approve <runId> [--note "..."]                # 核可檢查點，續跑
aipipe reject  <runId> [--note "..."]                # 駁回，終止 run
```

- `--input k=v` 可重複；缺 required input 時報錯。
- `run` 與 `approve` 完成後印出 run 目前狀態；若停在 checkpoint，印出 checkpoint prompt 提示核可指令。
- 參數解析用輕量做法（Bun 內建 `util.parseArgs` 或手寫），不引重依賴。

---

## 8. F. 檔案結構與測試

```
src/
  schema/     workflow.ts (zod+types) · parse.ts (載入驗證)
  engine/     runner.ts (狀態機) · context.ts (變數內插)
  driver/     types.ts · claude-code.ts · mock.ts
  store/      db.ts (migrations) · runs.ts · steps.ts · checkpoints.ts
  cli/        index.ts · commands/ (run.ts · list.ts · show.ts · approve.ts · reject.ts)
workflows/    範例 YAML（write-blog-post.yaml 等）
tests/        單元 + 整合
```

### 測試策略（TDD，目標 80%+）

- 單元：schema 驗證（合法/非法）、變數內插（含未定義變數）、引擎狀態轉換（用 MockDriver）、各 repository CRUD。
- 整合：完整 run → 命中 checkpoint → paused → approve → 續跑 → completed；以及 reject 路徑、driver 失敗路徑。
- 真實 `ClaudeCodeDriver`：可跳過的 smoke test（需 `claude` 登入），不進 CI 必跑。

### 慣例

- 檔案聚焦（200–400 行典型，800 上限），多小檔勝過少大檔。
- 邊界驗證輸入（YAML 載入、CLI input）；內部呼叫信任。
- 錯誤在有足夠 context 的邊界處理並附說明，不靜默吞掉。
- 不可變：context 每階段回傳新物件，不原地改輸入。

---

## 9. 開放項 / 後續子專案接口

- **即時串流**：driver 已預留；子專案 2 以 `stream-json` + SSE 實作。
- **多驅動**：`AgentDriver` 介面已抽象，加 `CodexDriver` 不動引擎。
- **工作流註冊表**：目前以磁碟 YAML 為主；若需 Web 管理，之後加 `workflows` 表。
- **權限/帳號**：小團隊自架，留待 API 子專案（子系統 5）處理 `decided_by` 等欄位。
