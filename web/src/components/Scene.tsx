import type { ReactNode } from "react";
import { assetPath } from "../assets/assets.config";

export function Scene({ children }: { children: ReactNode }) {
  const bg = assetPath("scene-bg");
  return (
    <div className="cabinet">
      <div
        className="field"
        style={bg ? { backgroundImage: `url(${bg})`, backgroundSize: "cover" } : undefined}
      >
        {!bg && <div className="grove" />}
        <div className="scene-decor">
          <div className="scene-counter" />
          <div className="scene-banner scene-banner-left" />
          <div className="scene-banner scene-banner-right" />
          <div className="scene-light" />
          <div className="scene-dust scene-dust-1" />
          <div className="scene-dust scene-dust-2" />
          <div className="scene-dust scene-dust-3" />
          <div className="scene-dust scene-dust-4" />
          <div className="scene-dust scene-dust-5" />
        </div>
        <div className="scene-characters">
          {children}
        </div>
      </div>
    </div>
  );
}
