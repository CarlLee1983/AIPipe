# AGENTS.md

本檔提供給 AI coding agent（Claude Code 等）在此 repo 工作時的指引。人類請優先看 [`README.md`](README.md)。

## 專案本質

AIPipe 是一個「多階段 AI Agent 工作流」引擎：以 YAML 描述 workflow，引擎逐 stage 呼叫 driver（真實 Claude Code 或 mock），狀態持久化於 SQLite，並可在任一 stage 設 **checkpoint** 暫停等待人工核可。提供 **CLI** 與 **Web 勇者大廳**（HTTP + SSE）兩個入口，兩者共用同一組引擎依賴。

## 常用指令

執行環境是 **Bun**（非 Node）。無 lint 設定；型別檢查靠 `tsc`。

```bash
bun install                  # 安裝後端依賴（前端在 web/ 另裝）

# 後端 + 引擎測試
bun test                     # 跑全部 tests/
bun test tests/engine/runner.start.test.ts   # 單一檔
bun test --test-name-pattern "checkpoint"    # 依測試名過濾

# 型別檢查（無 build step，tsc noEmit）
bunx tsc --noEmit            # 後端；前端在 web/ 下 bunx tsc --noEmit

# CLI
bun run cli run workflows/<file>.yaml --input k=v
bun run cli list | show <runId> | approve <runId> --note "..." | reject <runId>

# 伺服器（開發：後端 :3000 + 前端 :5173）
bun run server               # 後端
bun run dev:web              # 前端 Vite dev（/api proxy 到 :3000）
AIPIPE_MOCK=1 bun run server # 用 MockDriver，不呼叫真實 Claude

# 前端（在 web/ 目錄下）
cd web && bun test           # 元件 / API 單元測試（happy-dom）
cd web && bun run e2e        # Playwright E2E（會先 build，並自動起後端＋MockDriver）
cd web && bun run build      # tsc && vite build → web/dist
```

## 架構重點（跨檔案才看得出的大局）

### 引擎是純函式狀態機，依賴用注入
- `src/engine/runner.ts` 是核心。所有狀態轉移是**自由函式**（`createRun` / `startRun` / `executeFrom` / `prepareResume` / `resumeRun`），第一參數一律是 `EngineDeps`（`runs` / `steps` / `checkpoints` repositories + `driver` + 選用 `logger` / `observer`）。引擎不自己 new 任何東西——依賴由呼叫端組裝。
- **組裝點有兩個**：CLI 走 `src/cli/deps.ts` 的 `buildDeps()`；Server 在 `src/server/index.ts` 自行組。兩者都注入同一組 repository 與 driver。新增引擎能力時，維持「函式 + 注入」形態，不要在引擎內讀 env 或建立連線。

### Run 生命週期與 checkpoint 的暫停/續跑
- 狀態流：`pending → running → (paused at checkpoint) → running → completed`，或 `failed` / `rejected`。
- `executeFrom(deps, run, workflow, fromIndex)` 從指定 stage index 往後跑；遇到 `stage.checkpoint` 就寫入 checkpoint、把 `currentStageIndex` 設為**下一格**、狀態轉 `paused`，然後 return（不繼續）。
- 續跑靠 `resumeRun` / `prepareResume`：核可 → 從 `currentStageIndex` 再 `executeFrom`；駁回 → 狀態轉 `rejected`。因為 index 已指向下一格，續跑不會重跑 checkpoint 那一 stage。
- **持久化的是 workflow 快照**（`workflowSnapshot`，原始 YAML 字串），續跑時用 `loadWorkflowFromString` 重新解析——所以 run 建立後改 YAML 檔不影響進行中的 run。

### Context 插值
- `src/engine/context.ts`：`inputs` 與各 stage 的 `output` 都存進 context（一個 `Record<string,string>`）。stage prompt 用 `{{name}}` 插值；缺變數時以空字串代入並透過 `logger` 警告（不擲錯）。缺 **required input** 才在 `createRun` 擲錯。

### Driver 抽象
- `src/driver/types.ts` 定義 `AgentDriver.run(input) → { output, success, raw }`。
- `ClaudeCodeDriver`（真實，spawn `claude` CLI）與 `MockDriver`（測試/離線）皆實作此介面。要離線測流程就用 `AIPIPE_MOCK=1` 或直接注入 `MockDriver`。

### Server：函式式 handler + EventBus + SSE
- `src/server/index.ts` 的 `startServer` 用 `Bun.serve`，以正則比對路由，把請求轉給 `src/server/routes/runs.ts` 的 **handler 函式**（`createRunHandler` / `resumeRunHandler` / `getRunHandler` / `listRunsHandler`），handler 直接回傳 `Response`，統一經 `withCors` 包裝並附 CORS 標頭。`main()` 讀環境變數後呼叫 `startServer`。
- **即時串流**：引擎的 `RunObserver` 在 server 端由 `src/server/background.ts` 的 `createObserverForBus` 接到 `EventBus`（`src/server/events/bus.ts`），再由 `src/server/sse.ts` 推給前端。工作流在背景跑（`startInBackground`），HTTP 請求立刻回應、進度靠 SSE。
- 新增 API 時：在 `index.ts` 的 `startServer` 加路由分支 + 在 `routes/runs.ts`（或新 route 檔）加 handler 函式，若要即時更新前端就經 EventBus emit 對應事件。

### Store 是 thin repository over bun:sqlite
- `src/store/db.ts` 的 `openDb` 開檔即 migrate（`CREATE TABLE IF NOT EXISTS` runs / steps / checkpoints，開 `strict` 與 `foreign_keys`）。三個 repository 類別包 SQL，引擎只碰 repository 介面、不碰 SQL。

### 前端（web/）
- React 18 + Vite，CT（超時空之鑰）風格 SPA。透過 `web/src/api/` 打後端 REST + 訂閱 `web/src/api/sse.ts` 的事件流。dev 時 Vite 把 `/api` proxy 到 `:3000`。

## 慣例與注意事項

- **語言**：程式內的使用者訊息、log、錯誤字串多為繁體中文（見 runner / cli），沿用之。
- **不可變**：引擎以「回傳新 context」而非 mutate 既有物件的方式推進（`withOutput` 回傳新物件），維持此風格。
- **DB 預設路徑**：CLI 與 Server 皆預設 `./aipipe.sqlite`，可用 `AIPIPE_DB` 覆寫。CLI 與 Web 共用同一顆 SQLite，跨入口操作同一批 run 時確認指向同一路徑。
- **環境變數**：`AIPIPE_PORT`(3000) / `AIPIPE_DB` / `AIPIPE_MOCK`(=1 用 mock) / `AIPIPE_STATIC`(前端 dist 目錄，設了就單行程一併伺服前端) / `AIPIPE_WORKFLOWS`(workflows 目錄)。
- **測試框架**：後端 `bun test`；前端元件測試用 `@testing-library/react` + happy-dom（`web/test-setup.ts` 註冊 global）；E2E 用 Playwright 且**強制走 MockDriver**。改引擎/ server 行為時，對應 `tests/engine/*`、`tests/server/*` 應同步。

## 設計/規格文件

實作前若涉及較大改動，先看 `docs/superpowers/specs/` 與 `docs/superpowers/plans/`——既有的 quest-engine-core 與 api-web-hall 設計脈絡都在那裡。啟動細節見 `docs/running.md`。
