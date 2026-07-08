# 勇者大廳像素素材清單

前端目前可在沒有圖片素材時使用 **內建 SVG 佔位**（路人、對話頭像）或 CSS 佔位正常運作。若要替換成像素素材，建議把生成檔案放到 `web/public/assets/`，再更新 `web/src/assets/assets.config.ts` 對應路徑即可（與 `player.png` 相同流程；SVG 會自動讓位）。

整體風格關鍵字：

`16-bit SNES JRPG, Chrono Trigger style, Akira Toriyama influence, bright warm daylight palette, crisp pixel art, no anti-aliasing`

## 生成後處理

透明 PNG 素材建議先用 imagegen 生成「純色 chroma-key 背景」來源圖，再用專案工具裁切、去背、縮放成前端實際尺寸：

```bash
python3 scripts/prepare-pixel-asset.py \
  --input ~/.codex/generated_images/<run>/<image>.png \
  --output web/public/assets/adventurer.png \
  --size 48x72
```

頭像使用 `--size 48x48`。工具會呼叫 Codex imagegen 的 `remove_chroma_key.py`，再驗證輸出尺寸、透明角落與可見 alpha 像素。

| AssetKey | 檔名建議 | 用途 | 規格 | 生成 prompt |
| --- | --- | --- | --- | --- |
| `scene-bg` | `scene-bg.png` | 大廳場景背景 | 4:3（建議 960×720 以上） | top-down guild hall interior, warm stone floor, wooden counter, banners, sunlit |
| `npc-master` | `npc-master.png` | 公會主 | 透明背景；高度約為場景 **31%**（與 player 同比例尺） | guild master NPC, bearded, robed, front-facing pixel sprite |
| `player` | `player.png` | 玩家角色 | 透明背景；高度約為場景 **34%** | young adventurer hero sprite, front-facing, sword on back |
| `adventurer` | `adventurer.png` | 氛圍冒險者（3 位置共用，以 hue-rotate 區分） | 透明背景；高度約為場景 **27%**（略小表現後景） | generic adventurer townsperson sprite, front-facing |

> 對話頭像不另外生成：直接重用全身像 `npc-master` / `player`，由 `DialogBox` 的 `PORTRAIT_CROP` 以百分比框裁切聚焦頭部（見 `web/src/components/DialogBox.tsx`）。日後若要專屬頭像，新增 AssetKey + 裁切設定即可。

## 可選音效

放入 `web/public/assets/` 後，更新 `assets.config.ts` 中對應路徑（例如 `"/assets/sfx-cursor.wav"`）。

| AssetKey | 檔名建議 | 用途 | 方向 |
| --- | --- | --- | --- |
| `sfx-cursor` | `sfx-cursor.wav` | 任務列選取 | 8-bit UI blip |
| `sfx-confirm` | `sfx-confirm.wav` | 核可 checkpoint | 8-bit confirm jingle |
| `sfx-complete` | `sfx-complete.wav` | 任務完成 | 8-bit victory jingle |
