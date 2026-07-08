import type { AssetKey } from "./assets.config";

type SvgProps = { variant?: number; className?: string };

/** 16-bit 風格像素路人；variant 0/1/2 配色不同 */
export function AdventurerSvg({ variant = 0, className }: SvgProps) {
  const palettes = [
    { hair: "#5a3820", tunic: "#3a7a48", pants: "#2a4a68", skin: "#f0c090" },
    { hair: "#282038", tunic: "#8a5030", pants: "#3a3028", skin: "#e8b080" },
    { hair: "#684020", tunic: "#4868a8", pants: "#384858", skin: "#d8a070" },
  ];
  const c = palettes[variant % palettes.length]!;
  return (
    <svg className={className} viewBox="0 0 24 36" width="100%" height="100%" aria-hidden="true">
      <rect x="9" y="2" width="6" height="5" fill={c.hair} />
      <rect x="8" y="7" width="8" height="6" fill={c.skin} />
      <rect x="7" y="13" width="10" height="10" fill={c.tunic} />
      <rect x="5" y="14" width="3" height="8" fill={c.skin} />
      <rect x="16" y="14" width="3" height="8" fill={c.skin} />
      <rect x="8" y="23" width="4" height="9" fill={c.pants} />
      <rect x="12" y="23" width="4" height="9" fill={c.pants} />
      <rect x="7" y="32" width="4" height="3" fill="#282018" />
      <rect x="13" y="32" width="4" height="3" fill="#282018" />
    </svg>
  );
}

export function PortraitMasterSvg({ className }: SvgProps) {
  return (
    <svg className={className} viewBox="0 0 48 48" width="100%" height="100%" aria-hidden="true">
      <rect x="0" y="0" width="48" height="48" fill="#3a3028" rx="4" />
      <rect x="14" y="10" width="20" height="14" fill="#f0c090" />
      <rect x="12" y="8" width="24" height="8" fill="#686868" />
      <rect x="16" y="18" width="16" height="4" fill="#b08050" />
      <rect x="10" y="24" width="28" height="18" fill="#4868a8" />
      <rect x="18" y="14" width="4" height="3" fill="#282018" />
      <rect x="26" y="14" width="4" height="3" fill="#282018" />
    </svg>
  );
}

export function PortraitHeroSvg({ className }: SvgProps) {
  return (
    <svg className={className} viewBox="0 0 48 48" width="100%" height="100%" aria-hidden="true">
      <rect x="0" y="0" width="48" height="48" fill="#283848" rx="4" />
      <rect x="16" y="12" width="16" height="12" fill="#e8b080" />
      <rect x="14" y="8" width="20" height="8" fill="#5a3820" />
      <rect x="12" y="24" width="24" height="16" fill="#3a7a48" />
      <rect x="18" y="16" width="4" height="3" fill="#181818" />
      <rect x="26" y="16" width="4" height="3" fill="#181818" />
    </svg>
  );
}

const SVG_FALLBACKS: Partial<Record<AssetKey, (props: SvgProps) => JSX.Element>> = {
  adventurer: AdventurerSvg,
  "portrait-master": PortraitMasterSvg,
  "portrait-hero": PortraitHeroSvg,
};

export function hasSvgFallback(key: AssetKey): boolean {
  return key in SVG_FALLBACKS;
}

export function SvgFallback({ assetKey, variant, className }: { assetKey: AssetKey; variant?: number; className?: string }) {
  const Component = SVG_FALLBACKS[assetKey];
  if (!Component) return null;
  return <Component variant={variant} className={className} />;
}
