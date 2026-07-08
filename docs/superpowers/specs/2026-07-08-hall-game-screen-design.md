# 公會大廳「遊戲畫面化」設計

> 日期：2026-07-08　範圍：純前端（`web/`）　後端／API／SSE 不動

## 目標與問題

現況 `Hall` 把所有內容垂直堆疊在一頁：HudBar → (Scene ＋ 側欄任務板/發任務) → QuestLog → DialogBox。資訊一多就得往下捲，本質是「有裝飾的網頁」。

目標是把大廳變成**一台遊戲機**：固定比例畫面、頁面永不捲動、查任務清單與細節靠「切換場景／開選單」而非往下捲。

## 已確認決策

1. **導覽模型 — 混合**：大廳為家；點進「某任務的詳情」才整頁轉場到專屬畫面，看完返回大廳。
2. **滿版規則 — 固定機台比例（letterbox）**：整個 app 是一台固定比例的機台，置中填滿螢幕、四周留黑邊。比例沿用現有 `4 / 3`（集中成一個變數，日後可改 16:9）。
3. **長內容 — 面板內部遞捲**：詳情裡過長的 stage 輸出在面板內 `overflow-y:auto` 捲動；機台不動、頁面不捲。
4. **大廳操作 — 底部指令列 → 開選單**：大廳平時只有場景；底部一列 JRPG 指令，點指令才滑出對應視窗（任務板清單、發任務表單），疊在場景上。

## 架構：單機台 ＋ 畫面狀態機

整個 app 是一台固定比例的 `.cabinet`。機台內以 z-index 分層堆疊，`Hall` 升級為畫面協調器，持有兩個狀態：

- `screen`: `"lobby" | "detail"`
- `lobbyMenu`: `null | "board" | "new"`（僅 `lobby` 有意義）

資料狀態（`workflows` / `runs` / `selectedId` / `useRun` / SSE 訂閱）維持現狀，不變。

### 機台外框（letterbox）

- `body`：深色底、`overflow: hidden`，頁面層級永不出現捲軸。
- `.hall-shell`：letterbox 框——`min-height:100vh`、flex 置中、`overflow:hidden`。
- `.cabinet`：`aspect-ratio: var(--cabinet-ratio, 4/3)`；以 `max-height:100vh` 與對應 `max-width` 換算，量到多少填多少，其餘留黑邊。`position: relative`，作為所有分層的定位容器。
- **所有 UI 都搬進機台內**（含現在在機台外的 HudBar、QuestLog、DialogBox），成為絕對定位的 overlay 分層。

### 分層（z-index，由底到頂）

| 層 | 內容 | 出現於 |
|----|------|--------|
| z0 | `Scene`（field 背景、櫃台、旗幟、光塵、NPC＋玩家） | 兩畫面皆為背景 |
| z10 | 頂部 HUD 條（`HudBar` 改成貼機台頂緣的緞帶） | 兩畫面 |
| z20 | 底部指令列（`CommandBar`） | 僅 lobby |
| z30 | 選單視窗（`OverlayWindow` 內裝 `QuestMenu` 或 `NewQuestForm`） | 僅 lobby，`lobbyMenu !== null` 時 |
| z30 | 詳情主體（`QuestDetailScreen`） | 僅 detail |
| z40 | 對話框／檢查點（`DialogBox` / `CheckpointPrompt`） | detail（含核可流程） |

## 元件

### 新增（三個小檔）

- **`CommandBar.tsx`**：大廳底部 JRPG 指令列 `▶ 任務板　發任務`。點指令設定 `lobbyMenu` 並播 `sfx-cursor`。
- **`OverlayWindow.tsx`**：通用視窗殼——半透明壓暗背景 ＋ 置中 `ct-window` ＋ 關閉鈕，支援 Esc 與點背景關閉。children 放實際內容。
- **`QuestDetailScreen.tsx`**：詳情畫面主體。包 `QuestLog`（固定高度、面板內遞捲）＋ 底部 `DialogBox`／`CheckpointPrompt`（沿用）＋ 左上角「← 返回大廳」指令。

### 沿用（擺放位置改變，內部不動）

- `Scene` / `Sprite`：維持為 z0 背景。
- `HudBar`：定位改為機台頂緣緞帶（CSS 為主，必要時微調 props/class）。
- `QuestMenu`：改放進 `board` 選單視窗。
- `NewQuestForm`：改放進 `new` 選單視窗。
- `QuestLog`：改放進 `QuestDetailScreen`，套固定高度＋遞捲。
- `DialogBox` / `CheckpointPrompt`：詳情畫面底部沿用。

## 流程

- **開選單**：大廳點「任務板」→ `lobbyMenu="board"`；點「發任務」→ `lobbyMenu="new"`。Esc／點背景／關閉鈕 → `lobbyMenu=null`。
- **進詳情**：任務板選任務 → `setSelectedId(id)`、`setScreen("detail")`、`setLobbyMenu(null)`、播 `sfx-cursor`。
- **返回**：詳情左上「← 返回大廳」→ `setScreen("lobby")`，**保留 `selectedId`**（SSE 續訂、返回大廳仍即時更新任務板狀態）。
- **發新任務**：`NewQuestForm` 成功建立 → `setSelectedId(newId)`、`setScreen("detail")`、`setLobbyMenu(null)`，直接轉場進該 run 詳情。
- **檢查點**：詳情畫面若有 `pending` checkpoint，底部顯示 `CheckpointPrompt`（沿用），否則顯示 `DialogBox`。

## 轉場與細節

- 畫面切換用 CSS class 淡入 ＋ 輕微滑動（~200ms）；**尊重 `prefers-reduced-motion`**（偵測到則關閉位移與淡入）。
- 音效沿用既有：選任務/開選單 `sfx-cursor`、核可 `sfx-confirm`、完成 `sfx-complete`（`run:done`）。
- 響應式：letterbox 於窄螢幕仍以寬度為準縮放；指令列與視窗隨機台等比縮小（沿用現有 `@media` 斷點思路，改成縮放機台而非重排）。

## 測試

- **元件**：
  - 擴充 `Hall.test.tsx`：大廳預設只見場景＋指令列；點「任務板」→ 見任務佈告欄；點「發任務」→ 見發佈表單；選任務 → 進詳情見冒險日誌；「返回大廳」→ 回到指令列。
  - `QuestLog`：驗證遞捲容器（固定高度 ＋ `overflow` 樣式類別存在）。
  - 既有元件測試（QuestMenu / NewQuestForm / DialogBox / CheckpointPrompt）內容不變，沿用。
- **E2E**（`web/tests/e2e/quest-flow.e2e.ts` 需更新）：`/` → HUD 見「勇者公會大廳」→ 點「發任務」開視窗 → 選 `e2e-demo`、填 `topic`、`發佈任務` → 自動轉場進詳情 → 見「資料看起來 OK 嗎？」→ `▶ 核可` → 見「任務完成，做得好，勇者！」。

## 不做（YAGNI）

- 不引入 react-router／新依賴（路線 B 排除）。
- 不改後端、API、SSE、引擎。
- 不新增「名冊/記錄」等尚無資料來源的指令（保留未來擴充位即可）。
- 不做像素完美美術，維持現有素材與 CT 風格。

## 影響檔案

- 改：`web/src/components/Hall.tsx`、`web/src/components/HudBar.tsx`、`web/src/theme/scene.css`、`web/src/theme/ct-window.css`、`web/src/App.css`
- 增：`web/src/components/CommandBar.tsx`、`web/src/components/OverlayWindow.tsx`、`web/src/components/QuestDetailScreen.tsx`
- 測試：`web/tests/components/Hall.test.tsx`（擴充）、`web/tests/e2e/quest-flow.e2e.ts`（更新）
