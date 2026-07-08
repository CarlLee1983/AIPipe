import type { ReactNode } from "react";
import type { AssetKey } from "../assets/assets.config";
import { assetPath } from "../assets/assets.config";
import { hasSvgFallback, SvgFallback } from "../assets/svg-fallbacks";
import { useTypewriter } from "../hooks/useTypewriter";

function Portrait({ assetKey, label }: { assetKey: AssetKey; label: string }) {
  const src = assetPath(assetKey);
  if (src) {
    return <img className="dialog-portrait-img" src={src} alt={label} />;
  }
  if (hasSvgFallback(assetKey)) {
    return (
      <div className="dialog-portrait-svg" aria-label={label}>
        <SvgFallback assetKey={assetKey} />
      </div>
    );
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
