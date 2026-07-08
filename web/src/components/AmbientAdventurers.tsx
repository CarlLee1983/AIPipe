import { Sprite } from "./Sprite";

const SPOTS = [
  { variant: 0, className: "ambient-adventurer ambient-a" },
  { variant: 1, className: "ambient-adventurer ambient-b" },
  { variant: 2, className: "ambient-adventurer ambient-c" },
] as const;

export function AmbientAdventurers() {
  return (
    <>
      {SPOTS.map((spot) => (
        <Sprite
          key={spot.variant}
          assetKey="adventurer"
          label={`冒險者 ${String.fromCharCode(65 + spot.variant)}`}
          className={spot.className}
          variant={spot.variant}
        />
      ))}
    </>
  );
}
