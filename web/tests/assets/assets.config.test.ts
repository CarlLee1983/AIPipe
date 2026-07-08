import { expect, test } from "bun:test";
import { assetPath, hasAsset } from "../../src/assets/assets.config";

test("未設定素材時回 null 並 hasAsset=false", () => {
  expect(assetPath("scene-bg")).toBeNull();
  expect(hasAsset("scene-bg")).toBe(false);
});

test("所有 key 都可查詢不擲錯", () => {
  for (const key of ["scene-bg", "npc-master", "player", "adventurer", "portrait-master", "portrait-hero"] as const) {
    expect(() => hasAsset(key)).not.toThrow();
  }
});
