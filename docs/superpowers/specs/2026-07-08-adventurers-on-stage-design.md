# 大廳「Run 化身冒險者」設計

> 日期：2026-07-08　範圍：純前端（`web/`）　後端／API／SSE 不動

## 目標與問題

現況大廳只有兩位固定角色（`npc-master` 公會主、`player` 玩家），進行中的 run 只是「任務佈告欄」清單裡的一行字。場景本質是靜態圖：角色不動、workflow 的執行過程沒被演出來、世界空蕩。

目標用**單一機制**同時解決三個缺口：

- 場景太靜止
- workflow 事件（執行／檢查點／完成）沒在畫面上被戲劇化
- 角色/NPC 太少

核心概念：**把每個進行中的 run 直接化身為大廳裡的一個冒險者 sprite，角色的站位與姿態就是 run 的狀態。** 大廳從「靜態看板」變成「隨工作流即時演出的舞台」，角色數量隨你跑的任務自然增減。

## 已確認決策

1. **走「Run 化身冒險者」路線**（相對於「氛圍與反應分開做」或「過場演出驅動」）。
2. **加輪詢**：以每 4 秒輪詢 `listRuns` 讓全場冒險者（非僅選中者）都會即時更新。日後可升級為全域 SSE。
3. **可見上限 6**：場上最多 6 個冒險者，溢位以「佈告欄還有 +M 筆」提示。
4. **零新美術上線**：冒險者一律先用現有 `player` 佔位圖或 `Sprite` 文字 fallback，靠 CSS（鏡像、hue-rotate、明暗）做出「不同人」的錯覺。真素材日後再換。

## 卡司模型

- **常駐卡司**（不動）：`npc-master`（櫃檯後）、`player`（前景視角代理）。維持現狀。
- **動態卡司 = run 的化身**：每個「非終結」run（`pending` / `running` / `paused`）在場上站成一個冒險者 sprite。
- **終結演出的時間窗**：`listRuns` 會回傳所有 run（含歷史已完成/失敗者），若單純「濾掉終結態」則慶祝／垂頭永遠不會出現。因此規則為：**顯示所有非終結 run，加上「`updatedAt` 在最近 8 秒內」的終結 run**。終結 run 在這 8 秒窗內演出 `celebrate`/`dejected` 後，下次輪詢（4 秒）時因超出窗而自然離場。此判斷純由 run 資料 ＋ `Date.now()` 導出，無需 client 端追蹤前一狀態，避免大廳越積越滿。

## 站位分區（zone）＝ run 狀態

| zone | 對應狀態 | 表現 |
|------|----------|------|
| 入口·準備區 `gate` | `pending` | 剛發佈、待啟動，入口待命 |
| 中央·出任務區 `field` | `running` | 揮劍／走動 idle 動畫 |
| 櫃檯前·候核可區 `counter` | `paused` | 排在公會主面前、頭上冒 `❓` 催核可 |
| 出場 `exit` | `completed` / `rejected` / `failed` | `completed` 慶祝後淡出；`rejected`/`failed` 垂頭離場 |

```
 [公會主]══櫃檯══   ← paused 冒險者排這（❓）
   ❓  ❓
        🧙  ⚔️        ← running 在中央出任務區
   🚶            🚶   ← pending 在入口待命
 [player 前景]
```

## 狀態→視覺（純函式，核心，可單測）

一個純函式把 run 映射到視覺表現，獨立成檔、獨立測試：

```ts
// web/src/components/adventurerView.ts
type Zone = "gate" | "field" | "counter" | "exit";
type Pose = "idle" | "working" | "waiting" | "celebrate" | "dejected";

interface AdventurerView {
  zone: Zone;
  pose: Pose;
  badge: string | null; // 例如 paused → "❓"
  leaving: boolean;      // 終結態 → true，觸發淡出離場
}

function adventurerView(run: Run): AdventurerView
```

映射表：

| status | zone | pose | badge | leaving |
|--------|------|------|-------|---------|
| `pending` | `gate` | `idle` | `null` | `false` |
| `running` | `field` | `working` | `null` | `false` |
| `paused` | `counter` | `waiting` | `"❓"` | `false` |
| `completed` | `exit` | `celebrate` | `null` | `true` |
| `rejected` | `exit` | `dejected` | `null` | `true` |
| `failed` | `exit` | `dejected` | `null` | `true` |

## 元件架構（貼現有 pattern）

### 新增

- **`adventurerView.ts`**：上述純函式。無 React 依賴，方便單測。
- **`Adventurer.tsx`**：包現有 `Sprite`，依 `AdventurerView` 套 `zone`/`pose`/`badge`/`leaving` 的 className；`onClick = onSelect(run.id)`；label 用 `run.workflowName`；佔位外觀差異用 index 推導（鏡像／hue-rotate class），讓每個看起來像「不同人」。
- **`AdventurerLayer.tsx`**：吃 `runs[]` 與 `onSelect`。過濾＋排序後取前 6 個渲染成一排 `Adventurer`，計算溢位數 `M` 並顯示「佈告欄還有 +M 筆」提示；掛進 `Scene` 的 `scene-characters`，與固定卡司並存。

### 沿用（不改內部）

- `Scene` / `Sprite`：`AdventurerLayer` 作為 `Scene` 的 children 之一，與固定 sprite 並存。Scene 本身不動。
- `QuestMenu`（任務佈告欄清單）：**保留**，作為鍵盤操作／溢位／a11y 的備援入口。
- `openQuest` 流程：點冒險者沿用 `Hall` 既有 `openQuest(id)`，進任務詳情。

## 可見上限與排序

- 場上最多 **6** 個冒險者。
- 過濾：顯示所有「非終結」run，加上 `updatedAt` 在最近 8 秒內的終結 run（見「終結演出的時間窗」）。
- 排序（決定誰進前 6）：`paused`（最需要你注意）> `running` > `pending`；同級以 `updatedAt` 新者優先。
- 溢位 `M = 符合條件的 run 數 − 已顯示數`；`M > 0` 時在角落顯示「佈告欄還有 +M 筆」，點擊等同開任務佈告欄（`lobbyMenu="board"`）。

## 資料流與即時性

- `Hall` 已持有 `runs` 並在事件／初始載入時 `loadRuns()`。`AdventurerLayer` 直接吃 `runs`。
- **輪詢**：`Hall` 內新增每 **4 秒**呼叫一次 `loadRuns()` 的計時器（`useEffect` + `setInterval`，卸載時清除），讓非選中的冒險者也會即時更新。既有「選中 run 的 SSE 事件觸發 reload」保留，兩者疊加。
- 點冒險者 → 沿用 `openQuest(run.id)` → 任務詳情（`screen="detail"`）。
- 冒險者進出場：以 React key = `run.id` 掛/卸。進場 `enter` 動畫在掛載時觸發。離場不做「掛載後再延遲卸載」的複雜收尾——改由上述 8 秒時間窗控制：終結 run 在窗內以 `leave`/`celebrate`/`dejected` 動畫演出，超窗後下次輪詢自然從視圖過濾掉。資料層一律以 `runs` ＋ 時間窗為準，不維護額外的離場佇列狀態。

## 轉場與細節（CSS）

- 站位：各 zone 以 `Scene` 內的絕對定位百分比錨點；同 zone 多人以水平位移錯開。
- 動畫 keyframes：`idle`（輕微上下浮動）、`working`（揮動）、`waiting`（原地小晃＋`❓` 冒出）、`celebrate`（跳躍＋亮光）、`dejected`（下沉變暗）、`enter`（淡入滑入）、`leave`（淡出滑出）。
- **尊重 `prefers-reduced-motion`**：偵測到則關閉浮動／位移，只保留出現／消失的透明度變化。
- 佔位外觀差異：`Adventurer` 依 index 給 `adv-tint-0..5` class（hue-rotate＋鏡像），零美術即有「不同人」感。

## 測試

- **`adventurerView` 純函式單測**（新 `web/tests/components/adventurerView.test.ts`）：6 種 status → 各自預期的 `zone`/`pose`/`badge`/`leaving`。
- **`AdventurerLayer` 元件測**（新 `web/tests/components/AdventurerLayer.test.tsx`）：
  - 給一組 runs → 渲染對應數量的冒險者；終結態不常駐。
  - 點冒險者 → 觸發 `onSelect(id)`。
  - 超過 6 個 → 只渲染 6 個並顯示「+M」提示；排序以 `paused` > `running` > `pending`。
- **`Hall.test.tsx` 擴充**：大廳出現冒險者層；點冒險者進詳情（沿用現有測試骨架）。
- **E2E**（沿用現有 MockDriver 骨架，更新 `web/tests/e2e/quest-flow.e2e.ts`）：發任務 → 場上出現冒險者 → 狀態轉 `paused` → 冒險者移到櫃檯區（class 斷言）→ 點冒險者進詳情。

## 不做（YAGNI）

- 不做慶祝粒子特效、職業/外觀真素材差異（列為之後）。
- 不做全域 SSE（先用輪詢，之後再升級）。
- 不加聲音（本輪非重點）。
- 不改後端、API、SSE、引擎。
- 不移除任務佈告欄清單（保留為備援）。

## 技術債附註（不在本輪範圍，先記錄）

診斷顯示 `web/` 有既有破損與死碼，與本設計無關，先記錄、之後另開清理：

- `svg-fallbacks.tsx` 仍引用已移除的 `adventurer` asset key（前次 commit 已刪除該子系統，殘檔待清）。
- 多個 web 測試 `bun:test` 型別找不到（`QuestLog` / `Hall` / `DialogBox` / `useSfx` / `assets.config` 等）。

## 影響檔案

- 改：`web/src/components/Hall.tsx`（掛 `AdventurerLayer`、加 4 秒輪詢）、`web/src/theme/scene.css`（zone 站位＋動畫）、`web/src/theme/ct-window.css`（如需「+M」提示樣式）
- 增：`web/src/components/adventurerView.ts`、`web/src/components/Adventurer.tsx`、`web/src/components/AdventurerLayer.tsx`
- 測試：新增 `web/tests/components/adventurerView.test.ts`、`web/tests/components/AdventurerLayer.test.tsx`；擴充 `web/tests/components/Hall.test.tsx`、更新 `web/tests/e2e/quest-flow.e2e.ts`
