export type AssetKey =
  | "scene-bg"
  | "npc-master"
  | "player"
  | "adventurer"
  | "portrait-master"
  | "portrait-hero"
  | "sfx-cursor"
  | "sfx-confirm"
  | "sfx-complete";

const ASSETS: Record<AssetKey, string | null> = {
  "scene-bg": "/assets/scene-bg.png",
  "npc-master": "/assets/npc-master.png",
  player: "/assets/player.png",
  adventurer: "/assets/adventurer.png",
  "portrait-master": "/assets/portrait-master.png",
  "portrait-hero": "/assets/portrait-hero.png",
  "sfx-cursor": null,
  "sfx-confirm": null,
  "sfx-complete": null,
};

export function assetPath(key: AssetKey): string | null {
  return ASSETS[key];
}

export function hasAsset(key: AssetKey): boolean {
  return ASSETS[key] !== null;
}
