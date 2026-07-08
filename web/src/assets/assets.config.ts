export type AssetKey =
  | "scene-bg"
  | "npc-master"
  | "player"
  | "adventurer"
  | "portrait-master"
  | "portrait-hero";

const ASSETS: Record<AssetKey, string | null> = {
  "scene-bg": "/assets/scene-bg.png",
  "npc-master": "/assets/npc-master.png",
  player: "/assets/player.png",
  adventurer: null,
  "portrait-master": null,
  "portrait-hero": null,
};

export function assetPath(key: AssetKey): string | null {
  return ASSETS[key];
}

export function hasAsset(key: AssetKey): boolean {
  return ASSETS[key] !== null;
}
