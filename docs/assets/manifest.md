# 勇者大廳像素素材清單

前端目前可在沒有圖片素材時使用 CSS 與文字佔位正常運作。若要替換成像素素材，建議把生成檔案放到 `web/public/assets/`，再依前端元件需要接入。

整體風格關鍵字：

`16-bit SNES JRPG, Chrono Trigger style, Akira Toriyama influence, bright warm daylight palette, crisp pixel art, no anti-aliasing`

| AssetKey | 檔名建議 | 用途 | 規格 | 生成 prompt |
| --- | --- | --- | --- | --- |
| `scene-bg` | `scene-bg.png` | 大廳場景背景 | 640x480、俯視 3/4 | top-down guild hall interior, warm stone floor, wooden counter, banners, sunlit |
| `npc-master` | `npc-master.png` | 公會主 | 64x96、透明背景 | guild master NPC, bearded, robed, front-facing pixel sprite |
| `player` | `player.png` | 玩家角色 | 56x96、透明背景 | young adventurer hero sprite, front-facing, sword on back |
| `adventurer` | `adventurer.png` | 氛圍冒險者 | 48x72、透明背景 | generic adventurer townsperson sprite, front-facing |
| `portrait-master` | `portrait-master.png` | 公會主對話頭像 | 48x48、透明背景 | dialogue portrait bust of guild master, JRPG dialogue style |
| `portrait-hero` | `portrait-hero.png` | 勇者對話頭像 | 48x48、透明背景 | dialogue portrait bust of hero |

## 可選音效

| 用途 | 檔名建議 | 方向 |
| --- | --- | --- |
| 游標移動 | `sfx-cursor.wav` | 8-bit UI blip |
| 核可 | `sfx-confirm.wav` | 8-bit confirm jingle |
| 任務完成 | `sfx-complete.wav` | 8-bit victory jingle |
