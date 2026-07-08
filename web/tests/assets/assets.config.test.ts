import { expect, test } from "bun:test";
import { hasSvgFallback } from "../../src/assets/svg-fallbacks";
import { assetPath, hasAsset } from "../../src/assets/assets.config";

test("主要場景素材已接入", () => {
  expect(assetPath("scene-bg")).toBe("/assets/scene-bg.png");
  expect(assetPath("npc-master")).toBe("/assets/npc-master.png");
  expect(assetPath("player")).toBe("/assets/player.png");
  expect(hasAsset("scene-bg")).toBe(true);
  expect(hasAsset("npc-master")).toBe(true);
  expect(hasAsset("player")).toBe(true);
});

test("路人像素素材已接入", () => {
  expect(assetPath("adventurer")).toBe("/assets/adventurer.png");
  expect(hasAsset("adventurer")).toBe(true);
});

test("SVG fallback 仍可用於缺圖素材", () => {
  expect(hasSvgFallback("adventurer")).toBe(true);
  expect(hasAsset("sfx-cursor")).toBe(false);
});

test("所有 key 都可查詢不擲錯", () => {
  for (const key of [
    "scene-bg", "npc-master", "player", "adventurer",
    "sfx-cursor", "sfx-confirm", "sfx-complete",
  ] as const) {
    expect(() => hasAsset(key)).not.toThrow();
  }
});
