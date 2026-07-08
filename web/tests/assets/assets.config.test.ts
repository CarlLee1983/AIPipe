import { expect, test } from "bun:test";
import { assetPath, hasAsset } from "../../src/assets/assets.config";

test("主要場景素材已接入", () => {
  expect(assetPath("scene-bg")).toBe("/assets/scene-bg.png");
  expect(assetPath("npc-master")).toBe("/assets/npc-master.png");
  expect(assetPath("player")).toBe("/assets/player.png");
  expect(hasAsset("scene-bg")).toBe(true);
  expect(hasAsset("npc-master")).toBe(true);
  expect(hasAsset("player")).toBe(true);
});

test("sfx 佔位素材尚未接入（路徑為 null）", () => {
  expect(hasAsset("sfx-cursor")).toBe(false);
  expect(assetPath("sfx-cursor")).toBe(null);
});

test("所有 key 都可查詢不擲錯", () => {
  for (const key of [
    "scene-bg", "npc-master", "player",
    "sfx-cursor", "sfx-confirm", "sfx-complete",
  ] as const) {
    expect(() => hasAsset(key)).not.toThrow();
  }
});
