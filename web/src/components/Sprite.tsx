import type { ReactNode } from "react";
import { assetPath, type AssetKey } from "../assets/assets.config";
import { hasSvgFallback, SvgFallback } from "../assets/svg-fallbacks";

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

export function Sprite({ assetKey, label, className, variant = 0 }: {
  assetKey: AssetKey;
  label: string;
  className?: string;
  variant?: number;
}) {
  const src = assetPath(assetKey);

  if (src) {
    return (
      <SpriteShell className={className}>
        <img
          className="sprite-img"
          src={src}
          alt={label}
          style={assetKey === "adventurer" ? { filter: `hue-rotate(${variant * 40}deg)` } : undefined}
        />
      </SpriteShell>
    );
  }

  if (hasSvgFallback(assetKey)) {
    return (
      <SpriteShell className={className}>
        <div className="sprite-svg-wrap" aria-label={label}>
          <SvgFallback assetKey={assetKey} variant={variant} className="sprite-svg" />
        </div>
      </SpriteShell>
    );
  }

  return (
    <SpriteShell className={className}>
      <div className="slot">{label}</div>
    </SpriteShell>
  );
}
