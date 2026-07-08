# 勇者大廳氛圍感強化 — 設計規格

- 日期：2026-07-08
- 狀態：已核可
- 前置：`2026-07-08-api-web-hall-design.md`（Web 勇者大廳基礎 UI）
- 範圍：純前端視覺與互動氛圍，三階段交付；引擎 / 後端 / API 不動

---

## 1. 背景與決策

使用者選擇 **E（分階段全做）**，並補充：

- **路人與動態效果先用內建 SVG 佔位**，視覺優於純 CSS 文字框
- **保留 `docs/assets/manifest.md` 生成清單與 prompt**；使用者日後生成 PNG 放入 `web/public/assets/` 並更新 `assets.config.ts` 即可替換（與 `player.png` 相同流程）
- **混合式架構**：CSS 場景裝飾 + SVG fallback + 設定驅動 PNG 插槽

| 主題 | 決策 |
|------|------|
| 路人冒險者 | 內建 SVG（3 款配色）→ 日後 `adventurer.png` 替換 |
| 對話頭像 | 內建 SVG bust → 日後 `portrait-*.png` 替換 |
| 場景裝飾 | 純 CSS 疊加在 `scene-bg.png` 上 |
| 動畫 | CSS keyframes（idle-bob、光柱 pulse、塵埃飄移）|
| 音效 | Phase 3；缺檔靜默；HudBar 靜音切換 + localStorage |
| HUD 數值 | 純裝飾（Lv / 聲望 / 金幣），不接後端 |

**Out of scope**：真實 RPG 數值系統、新 API、引擎改動、素材產製（使用者外部生成）。

---

## 2. Phase 1 — 場景靜態 + 動態生命感

### 場景裝飾層（`Scene.tsx` + `scene.css`）

在現有背景上疊加：

| 元素 | class | 說明 |
|------|-------|------|
| 櫃檯 | `.scene-counter` | 木質橫條，NPC 後方 |
| 旗幟 ×2 | `.scene-banner` | 左右牆面 |
| 光柱 | `.scene-light` | 暖色斜光，緩慢 pulse |
| 塵埃 | `.scene-dust` ×5 | 小點緩慢飄移 |

### 路人冒險者（`AmbientAdventurers.tsx`）

- 3 個固定位置的小角色
- PNG 存在（`assets.config` `adventurer`）→ `<img>` + `hue-rotate` 配色差異
- PNG 不存在 → 內建 SVG 元件（3 款配色）
- 共用 `idle-bob` 動畫，相位錯開

### Sprite 微動

- `.sprite-npc` / `.sprite-player`：`idle-bob`（2.5s）
- `runStatus === "running"` 時玩家 `idle-bob-active`（幅度略增）

---

## 3. Phase 2 — UI 細節

### 對話框（`DialogBox.tsx`）

- 左側 48×48 頭像區；PNG 優先，否則 SVG fallback
- `useTypewriter`：旁白逐字（~30ms/字）；`CheckpointPrompt` 禁用打字機

### HUD（`HudBar.tsx`）

裝飾數值列：`Lv.12  聲望 ★★★☆  金幣 1,240G`

### 任務狀態色（`QuestMenu` + `ct-window.css`）

| 狀態 | 色 |
|------|-----|
| 執行中 | `#ffe27a` |
| 待核可 | `#bff4ff` |
| 完成 | `#7dffb0` |
| 失敗/駁回 | `#ff8a8a` |

---

## 4. Phase 3 — 音效

### 設定（`assets.config.ts`）

```ts
"sfx-cursor": "/assets/sfx-cursor.wav" | null
"sfx-confirm": "/assets/sfx-confirm.wav" | null
"sfx-complete": "/assets/sfx-complete.wav" | null
```

### `useSfx` hook

- 預載已設定音效；播放前檢查靜音
- `localStorage` key `aipipe-sfx-muted`
- HudBar 🔊/🔇 切換

### 觸發點

| 事件 | 音效 |
|------|------|
| 任務列選取 | cursor |
| 核可 | confirm |
| run 完成（SSE `run:done`）| complete |

---

## 5. 素材替換流程（不變）

1. 依 `docs/assets/manifest.md` 生成 PNG
2. 放入 `web/public/assets/`
3. 更新 `web/src/assets/assets.config.ts` 對應路徑
4. 重新整理即生效；SVG fallback 自動讓位

---

## 6. 檔案清單

```
web/src/assets/svg-fallbacks.tsx     SVG 元件（adventurer ×3、portrait ×2）
web/src/components/AmbientAdventurers.tsx
web/src/hooks/useTypewriter.ts
web/src/hooks/useSfx.ts
web/src/components/Scene.tsx         裝飾層 + runStatus
web/src/components/Sprite.tsx        PNG → SVG → CSS 三級 fallback
web/src/components/DialogBox.tsx     頭像 + 打字機
web/src/components/HudBar.tsx        數值 + 靜音
web/src/components/Hall.tsx          串接
web/src/theme/scene.css
web/src/theme/ct-window.css
web/src/assets/assets.config.ts
docs/assets/manifest.md              補充 SVG→PNG 替換說明
```

---

## 7. 驗收標準

1. 開大廳可見櫃檯、光線、塵埃、3 路人 SVG、角色微動
2. 選 run → 對話框有 SVG 頭像；旁白打字；checkpoint 即時顯示
3. `running` 時玩家動畫略強
4. 有 sfx 檔時可播放；靜音可記憶
5. 放入 PNG 後 SVG 自動讓位；`bun test`（web/）全過
