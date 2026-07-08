export type AssetKey =
  | "scene-bg"
  | "npc-master"
  | "player"
  | "adventurer"
  | "sfx-cursor"
  | "sfx-confirm"
  | "sfx-complete";

const ASSETS: Record<AssetKey, string | null> = {
  "scene-bg": "/assets/scene-bg.png",
  "npc-master": "/assets/npc-master.png",
  player: "/assets/player.png",
  adventurer: "/assets/adventurer.png",
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
