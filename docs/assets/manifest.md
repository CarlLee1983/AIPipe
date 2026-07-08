# 勇者大廳像素素材清單

前端目前可在沒有圖片素材時使用 **內建 SVG 佔位**（路人、對話頭像）或 CSS 佔位正常運作。若要替換成像素素材，建議把生成檔案放到 `web/public/assets/`，再更新 `web/src/assets/assets.config.ts` 對應路徑即可（與 `player.png` 相同流程；SVG 會自動讓位）。

整體風格關鍵字：

`16-bit SNES JRPG, Chrono Trigger style, Akira Toriyama influence, bright warm daylight palette, crisp pixel art, no anti-aliasing`

| AssetKey | 檔名建議 | 用途 | 規格 | 生成 prompt |
| --- | --- | --- | --- | --- |
| `scene-bg` | `scene-bg.png` | 大廳場景背景 | 4:3（建議 960×720 以上） | top-down guild hall interior, warm stone floor, wooden counter, banners, sunlit |
| `npc-master` | `npc-master.png` | 公會主 | 透明背景；高度約為場景 **31%**（與 player 同比例尺） | guild master NPC, bearded, robed, front-facing pixel sprite |
| `player` | `player.png` | 玩家角色 | 透明背景；高度約為場景 **34%** | young adventurer hero sprite, front-facing, sword on back |
| `adventurer` | `adventurer.png` | 氛圍冒險者（3 位置共用，以 hue-rotate 區分） | 透明背景；高度約為場景 **27%**（略小表現後景） | generic adventurer townsperson sprite, front-facing |
| `portrait-master` | `portrait-master.png` | 公會主對話頭像 | 48x48、透明背景 | dialogue portrait bust of guild master, JRPG dialogue style |
| `portrait-hero` | `portrait-hero.png` | 勇者對話頭像 | 48x48、透明背景 | dialogue portrait bust of hero |

## 可選音效

放入 `web/public/assets/` 後，更新 `assets.config.ts` 中對應路徑（例如 `"/assets/sfx-cursor.wav"`）。

| AssetKey | 檔名建議 | 用途 | 方向 |
| --- | --- | --- | --- |
| `sfx-cursor` | `sfx-cursor.wav` | 任務列選取 | 8-bit UI blip |
| `sfx-confirm` | `sfx-confirm.wav` | 核可 checkpoint | 8-bit confirm jingle |
| `sfx-complete` | `sfx-complete.wav` | 任務完成 | 8-bit victory jingle |
