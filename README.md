# AIPipe

以 YAML 描述多階段的 AI Agent 工作流（workflow），由引擎逐階段執行、在檢查點（checkpoint）暫停等待人工核可，並提供 **CLI** 與 **Web 勇者大廳** 兩種操作入口。

- **引擎**：讀 workflow YAML，逐 stage 呼叫 driver，狀態與進度持久化於 SQLite。
- **檢查點**：任一 stage 可設 `checkpoint`，執行到此暫停（`paused`），核可後續跑、駁回則終止（`rejected`）。
- **兩個入口**：CLI 是第一個入口；Web 後端（HTTP + SSE）是第二個，共用同一組引擎依賴。
- **即時串流**：Web 前端透過 SSE 逐階段看勇者幹活，在瀏覽器發任務、核可／駁回檢查點。

## 技術棧

- **執行環境**：[Bun](https://bun.sh) + TypeScript
- **後端**：`Bun.serve`（HTTP / SSE / 靜態檔）、[zod](https://zod.dev)（邊界驗證）、`bun:sqlite`（持久化）、[yaml](https://eemeli.org/yaml/)
- **前端**：React 18 + [Vite](https://vitejs.dev)（CT 超時空之鑰風格 SPA）
- **測試**：`bun test`、@testing-library/react + happy-dom、[Playwright](https://playwright.dev)（E2E）

## 專案結構

```
src/
  engine/    # 狀態機：createRun / executeFrom / prepareResume / RunObserver
  driver/    # 執行後端：claude-code（真實）、mock（模擬）
  schema/    # workflow YAML 解析與型別
  store/     # SQLite repositories（runs / steps / checkpoints）
  cli/       # CLI 入口與 run/list/show/approve/reject 指令
  server/    # HTTP/SSE 後端：handlers / routes / events(bus) / sse / background
web/         # React + Vite 前端（勇者大廳）
workflows/   # workflow YAML 範例
docs/        # 啟動說明與素材清單
tests/       # 引擎與後端測試
```

## 快速開始

需求：已安裝 [Bun](https://bun.sh)。

```bash
bun install
```

### CLI

```bash
# 發起一個 workflow
bun run cli run workflows/write-blog-post.yaml --input topic="Bun 入門"

# 列出所有 run
bun run cli list

# 查看某個 run 的詳情
bun run cli show <runId>

# 在檢查點核可 / 駁回
bun run cli approve <runId> --note "草稿不錯"
bun run cli reject  <runId> --note "重寫第二段"
```

### Web 勇者大廳

開發模式（兩個行程）：

```bash
bun run server          # 後端 API，:3000
bun run dev:web         # 前端 Vite dev，:5173（/api proxy 到 :3000）
```

瀏覽器開 `http://localhost:5173`。

不想呼叫真實 Claude driver、只看流程時，用模擬驅動：

```bash
AIPIPE_MOCK=1 bun run server
```

單一行程（後端同時伺服前端）：

```bash
bun run build:web
AIPIPE_STATIC=./web/dist bun run server   # 開 http://localhost:3000
```

更多細節見 [`docs/running.md`](docs/running.md)。

## Workflow 格式

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
    agent:
      prompt: "把這篇草稿整理成最終格式：\n{{draft}}"
    output: final
```

- `inputs`：外部輸入，`required: true` 缺值時擲錯。
- `stages[].output`：把該 stage 輸出存進 context，供後續以 `{{name}}` 插值。
- `stages[].checkpoint`：設定後執行到此暫停，等待人工核可。

## 環境變數

| 變數 | 預設 | 說明 |
|------|------|------|
| `AIPIPE_PORT` | `3000` | 後端 HTTP 埠 |
| `AIPIPE_DB` | `./aipipe.sqlite` | SQLite 檔路徑 |
| `AIPIPE_MOCK` | — | 設為 `1` 時後端用模擬驅動（不呼叫真實 Claude） |
| `AIPIPE_STATIC` | — | 設為前端 build 目錄（如 `./web/dist`）時後端一併伺服前端 |

## 測試

```bash
bun test                     # 引擎 + 後端
cd web && bun test           # 前端單元 / 元件
cd web && bun run e2e        # Playwright E2E（自動起後端，用 MockDriver）
```

## License

尚未指定。
