import { assetPath, type AssetKey } from "../assets/assets.config";

export function Sprite({ assetKey, label, className }: {
  assetKey: AssetKey;
  label: string;
  className?: string;
}) {
  const src = assetPath(assetKey);
  if (src) {
    return (
      <div className={className}>
        <img className="sprite-img" src={src} alt={label} />
      </div>
    );
  }
  return <div className={`slot ${className ?? ""}`}>{label}</div>;
}
