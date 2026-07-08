# AIPipe — 子專案 2：API + 即時串流 + 勇者大廳 Web UI 設計規格

- 日期：2026-07-08
- 狀態：已核可，待進入實作計畫
- 前置：子專案 1（Quest Engine 核心）已完成並合併
- 範圍：最小 Bun 後端（HTTP + SSE）+ React/Vite 勇者大廳前端，包成單一子專案

---

## 1. 背景與決策（brainstorming 結論）

藍圖原訂順序為「子專案 2：獨立 API」→「子專案 3：Web UI」。本次決定**合併並提前做 Web UI**：
Web UI 本身需要後端才能觸發任務與讀資料，因此在同一子專案內建一個**最小後端**（只做 UI 需要的端點），
而非先獨立做完整 API。引擎核心不動，後端只是引擎的第二個入口（CLI 是第一個）。

| 主題 | 決策 |
|------|------|
| 下一步範圍 | 直接做勇者大廳 Web UI，後端最小同包 |
| 後端做法 | Bun `Bun.serve`，包現有引擎（`buildDeps` 重用），伺服靜態前端 |
| 即時進度 | SSE 即時推播（stage 級事件），非輪詢 |
| 前端棧 | React + Vite（藍圖原訂）|
| 視覺方向 | **超時空之鑰（Chrono Trigger）風格**：明亮暖色俯視場景 + 深藍圓角亮青浮雕框視窗；有 NPC 與玩家角色 |
| 素材策略 | 框架先做、留乾淨插槽；附**素材清單 + 生成 prompt** 給使用者外部生成後放回；素材走設定驅動、缺檔 fallback CSS 佔位 |
| 引擎改動 | 僅加 optional `observer` hook 供 SSE 取事件，不動狀態機邏輯 |

**核心驗收目標**：瀏覽器發任務 → 大廳即時看勇者逐階段幹活 → 命中檢查點對話框暫停 → 點核可 → 續跑至完成。

**Out of scope（後續）**：token 級串流（`stream-json`）、帳號/權限、多驅動、排程/webhook、真實像素素材產製（由使用者生成）、音效系統實作（僅預留插槽）。

---

## 2. 整體架構與佈局

```
src/
  server/
    index.ts          Bun.serve：掛路由 + 靜態檔（正式）
    routes/
      workflows.ts     GET /api/workflows
      runs.ts          POST/GET /api/runs、GET /api/runs/:id
      resume.ts        POST /api/runs/:id/approve|reject
      events.ts        GET /api/events/:id（SSE）
    events/
      bus.ts           每個 run 一條事件流（in-process EventEmitter）
    background.ts      觸發後在背景跑 startRun/resumeRun，不阻塞 HTTP
    validation.ts      zod 驗證 request body
  engine/runner.ts    既有，加 optional RunObserver（唯一改動）
  schema/ driver/ store/ cli/   既有，全部沿用
web/                  React + Vite 前端（勇者大廳）
  vite.config.ts       dev proxy /api /api/events → :3000
  index.html
  src/
    main.tsx  App.tsx
    api/         client.ts（fetch 封裝）· sse.ts（EventSource 封裝＋重連）
    assets/      assets.config.ts（每個插槽的圖檔路徑；缺檔 fallback）
    components/  Hall.tsx · QuestMenu.tsx · DialogBox.tsx · Scene.tsx
                 CheckpointPrompt.tsx · NewQuestForm.tsx · HudBar.tsx
    hooks/       useRun.ts · useRunEvents.ts
    theme/       ct-window.css（CT 藍框皮膚）· scene.css
docs/assets/manifest.md   素材清單 + 生成 prompt
```

**執行模型：**
- **開發**：`bun run server`（API :3000）+ `vite dev`（前端 :5173，proxy `/api`、`/api/events` 到 3000）。兩行程。
- **正式**：`vite build` → 靜態檔；Bun server 同時伺服靜態檔與 API，單一 port、單一行程。

**非阻塞觸發（關鍵）：**
`POST /api/runs` 建立 run（`pending`）後**立即回傳 runId**，實際 `startRun` 在 `background.ts` 以 async 執行。
引擎本來就逐階段持久化，行程崩潰可從 DB 復原。前端拿 runId 後開 SSE 收即時進度。
`approve`/`reject` 同理：回應後背景續跑，SSE 續推。

---

## 3. 後端 API 端點

JSON 回應統一 envelope：`{ success: boolean, data?, error? }`。

| 方法 | 路徑 | 用途 | 回應 |
|------|------|------|------|
| GET | `/api/workflows` | 列出 `workflows/` 下 YAML（name/description/inputs） | 發任務選單用 |
| POST | `/api/runs` | body `{ workflow, inputs }`；缺 required input → 400 | 立即 `{ runId, status:"pending" }`，背景開跑 |
| GET | `/api/runs` | 列出所有 run 摘要（對應 CLI `list`） | run 陣列 |
| GET | `/api/runs/:id` | run 細節 + steps + checkpoints（對應 CLI `show`） | 完整 run |
| POST | `/api/runs/:id/approve` | body `{ note? }`，須 `paused` | 回 run，背景續跑 |
| POST | `/api/runs/:id/reject` | body `{ note? }` | 回 run（`rejected`）|
| GET | `/api/events/:id` | **SSE**，串流該 run 即時事件 | `text/event-stream` |

錯誤碼：驗證失敗 400、找不到 run 404、非 paused 卻核可 409，皆帶明確訊息。

---

## 4. SSE 即時事件

引擎觀察者觸發 → in-process bus → SSE 端點推給前端。事件（`event:` + `data:` JSON）：

| event | data | 觸發點 |
|-------|------|--------|
| `snapshot` | 目前 run + steps + checkpoints | 客戶端連上時先補送，避免錯過已發生階段 |
| `stage:start` | `{ stageId, name, index, prompt }` | 建 step、呼叫 driver 前 |
| `stage:done` | `{ stageId, output }` | step 成功、寫入 context 後 |
| `checkpoint` | `{ stageId, prompt, checkpointId }` | 命中檢查點、轉 paused |
| `run:done` | `{ status:"completed" }` | 全部階段完成 |
| `run:failed` | `{ stageId, error }` | driver/內部錯誤 |
| `ping` | `{}` | 定期心跳，避免中介斷線 |

- run 進終態（completed/paused/rejected/failed）後，送完對應事件即關閉該連線。
- bus 為 in-process（單機自架，符合藍圖定位）；不做事件持久化，重啟靠 DB 快照 + 前端重拉復原（YAGNI）。

---

## 5. 引擎觀察者 Hook（引擎唯一改動）

`EngineDeps` 加 optional `observer`；不傳時行為與現況完全相同（CLI 路徑零影響）。

```ts
export interface RunObserver {
  onStageStart?(e: { stageId: string; name?: string; index: number; prompt: string }): void;
  onStageDone?(e: { stageId: string; output: string }): void;
  onCheckpoint?(e: { stageId: string; prompt: string; checkpointId: string }): void;
  onRunDone?(e: { status: "completed" }): void;
  onRunFailed?(e: { stageId: string; error: string }): void;
}
export interface EngineDeps { /* 既有欄位不變 */ observer?: RunObserver; }
```

在 `executeFrom` 既有節點插入呼叫（純加行，不改控制流）：
建 step 呼叫 driver 前 → `onStageStart`；`steps.complete` 後 → `onStageDone`；
建 checkpoint 轉 paused 前 → `onCheckpoint`；driver 失敗 → `onRunFailed`；迴圈完成轉 completed 後 → `onRunDone`。

- 觀察者同步 fire-and-forget；server 端 callback 內自行 try/catch，事件推送失敗不得影響狀態機。
- 引擎不認識 HTTP/SSE，只吐語意事件（維持分層）。
- `background.ts` 呼叫 `startRun`/`resumeRun` 時傳入 observer，各 callback 把事件寫進該 runId 的 bus。

---

## 6. 前端：勇者大廳（Chrono Trigger 風格）

### 視覺方向
- **明亮暖色俯視場景**：鵝卵石廣場、層次樹叢、俯視光影、委託櫃檯。
- **CT 招牌視窗**：深藍圓角 + 亮青浮雕邊框，對話框與任務選單**共用同一套框**（純 CSS 多層 `box-shadow` 重現）。
- **有 NPC 與玩家角色**：櫃檯後 NPC 公會主、櫃檯前玩家角色、場景散佈冒險者。
- 無 emoji；游標用 `▶`、續行用 `▼`。

### 元件與資料流
- `HudBar`：玩家介面（名稱/等級/聲望/金幣/指令列）。
- `Scene`：場景背景 + 角色 sprite 插槽（讀 `assets.config`）。
- `QuestMenu`：CT 藍框任務佈告欄，列 run + 狀態徽章（執行中/待核可/完成）+ `▶` 游標；資料來自 `GET /api/runs`。
- `DialogBox`：CT 藍框對話框，跑階段旁白與檢查點提問；可選打字機逐字效果。
- `CheckpointPrompt`：對話框內「▶ 核可　駁回」互動 → 呼叫 approve/reject API。
- `NewQuestForm`：選 workflow + 填 inputs → `POST /api/runs`。
- `useRun` / `useRunEvents`：載入 run 細節、訂閱 SSE（`sse.ts` 封裝 EventSource，斷線自動重連並重拉 `/api/runs/:id` 補快照）。

### 素材設定驅動
`assets.config.ts` 定義每個插槽的圖檔路徑（背景 tileset、NPC、玩家、冒險者、頭像、音效）。
缺檔時 fallback 到 CSS 佔位樣式（即目前 mockup 的質感佔位）。使用者「生成後放回」= 丟檔 + 填路徑，零改元件。

---

## 7. 素材清單交付（asset manifest）

規格附 `docs/assets/manifest.md`，逐項列每個插槽的用途、規格建議、與**生成 prompt**：

| 素材 | 用途 | 規格建議 | 生成 prompt 要點 |
|------|------|----------|------------------|
| 大廳背景 tileset | 場景地板/牆 | 16px tile、暖色石板 | SNES Chrono Trigger 風俯視公會大廳石板廣場 tileset |
| NPC 公會主 sprite | 櫃檯後立繪 | idle + 說話 2 幀 | 16-bit 公會主 NPC，正面，CT 風 |
| 玩家角色 sprite | 玩家 | idle/走動 | 16-bit 冒險者主角，CT 風 |
| 冒險者 sprite ×N | 場景氛圍 | 數款配色 | 16-bit 路人冒險者數款 |
| 對話框頭像 | 說話者 | 48×48 | CT 對話框頭像框，公會主/勇者 |
| 音效（可選） | 游標/核可/完成 | 8-bit blip/jingle | 8-bit UI 音效 |

實作階段先產出 manifest（含完整 prompt），前端以 fallback 佔位交付；使用者生成後放回即成型。

---

## 8. 錯誤處理

- HTTP 邊界 zod 驗證 body（inputs、note）；不合法 400 + envelope，不進引擎。
- 背景引擎/driver 失敗 → 捕捉，run 標 `failed`、發 `run:failed`，前端對話框顯示「勇者倒下」訊息；HTTP 已回應故不 500。
- SSE observer callback 全程 try/catch，推送失敗不影響狀態機。
- 找不到 run 404、非 paused 核可 409，帶明確訊息。
- 前端 SSE 斷線自動重連 + 重拉快照補狀態。

---

## 9. 測試策略（TDD，目標 80%+）

- **單元**：路由 handler（mock 引擎依賴）、event bus 訂閱/發佈、observer callback 對應事件、request 驗證、前端元件（大廳視窗渲染 run 狀態、對話框顯示 checkpoint）。
- **整合**：`POST /api/runs` → 背景跑 → SSE 收 `stage:start/done` → `checkpoint` → `approve` → `run:done` 全序列；reject 路徑；driver 失敗路徑；SSE 重連補快照。
- **E2E**：一條 Playwright（發任務 → 看進度 → 核可 → 完成），用既有 `MockDriver`，不需真 `claude`。
- 沿用子專案 1 慣例：檔案聚焦（200–400 行典型、800 上限）、邊界驗證輸入、不可變 context、錯誤在有 context 的邊界處理。

---

## 10. 對後續子專案的接口

- **token 級串流**：driver 已預留 `stream-json`；日後把 SSE 事件擴充成 token 增量即可，前端 `useRunEvents` 不需重寫。
- **帳號/權限**：checkpoint 已有 `note`；日後加 `decided_by` 等欄位與登入即可掛上現有 approve/reject 端點。
- **多驅動**：`AgentDriver` 已抽象，後端不認識驅動細節。
- **真實素材**：manifest + 設定驅動，生成後放回不改前端邏輯。
