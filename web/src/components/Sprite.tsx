import type { ReactNode } from "react";
import { assetPath, type AssetKey } from "../assets/assets.config";

function SpriteShell({ className, children }: {
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className={className}>
      <div className="sprite-body">{children}</div>
    </div>
  );
}

export function Sprite({ assetKey, label, className }: {
  assetKey: AssetKey;
  label: string;
  className?: string;
}) {
  const src = assetPath(assetKey);

  if (src) {
    return (
      <SpriteShell className={className}>
        <img className="sprite-img" src={src} alt={label} />
      </SpriteShell>
    );
  }

  return (
    <SpriteShell className={className}>
      <div className="slot">{label}</div>
    </SpriteShell>
  );
}
