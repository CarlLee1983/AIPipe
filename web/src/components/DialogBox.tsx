import type { CSSProperties, ReactNode } from "react";
import type { AssetKey } from "../assets/assets.config";
import { assetPath } from "../assets/assets.config";
import { useTypewriter } from "../hooks/useTypewriter";

// 全身角色像用作對話頭像時，以百分比框裁切聚焦頭部（相對頭像框；框為正方形）
const PORTRAIT_CROP: Partial<Record<AssetKey, { w: string; x: string; y: string }>> = {
  "npc-master": { w: "196%", x: "-47%", y: "-15%" },
  player: { w: "205%", x: "-53%", y: "-12%" },
};

function Portrait({ assetKey, label }: { assetKey: AssetKey; label: string }) {
  const src = assetPath(assetKey);
  if (src) {
    const crop = PORTRAIT_CROP[assetKey];
    if (crop) {
      const style = {
        "--portrait-w": crop.w,
        "--portrait-x": crop.x,
        "--portrait-y": crop.y,
      } as CSSProperties;
      return (
        <img
          className="dialog-portrait-img dialog-portrait-img--crop"
          src={src}
          alt={label}
          style={style}
        />
      );
    }
    return <img className="dialog-portrait-img" src={src} alt={label} />;
  }
  return <div className="dialog-portrait-fallback">{label.charAt(0)}</div>;
}

export function DialogBox({ speaker, portraitKey, children, typewriter = false }: {
  speaker?: string;
  portraitKey?: AssetKey;
  children: ReactNode;
  typewriter?: boolean;
}) {
  const textContent = typeof children === "string" ? children : null;
  const displayed = useTypewriter(textContent ?? "", typewriter && textContent !== null);

  return (
    <div className="ct-window dialog-box">
      {portraitKey && (
        <div className="dialog-portrait">
          <Portrait assetKey={portraitKey} label={speaker ?? ""} />
        </div>
      )}
      <div className="dialog-body">
        {speaker && <span className="ct-who">{speaker}：</span>}
        {textContent !== null ? displayed : children}
        {typewriter && textContent !== null && displayed.length < textContent.length && (
          <span className="dialog-cursor">▼</span>
        )}
      </div>
    </div>
  );
}
