import type { ReactNode } from "react";
import { assetPath } from "../assets/assets.config";

export function Scene({ children }: { children: ReactNode }) {
  const bg = assetPath("scene-bg");
  return (
    <div className="cabinet">
      <div className="field" style={bg ? { backgroundImage: `url(${bg})`, backgroundSize: "cover" } : undefined}>
        {!bg && <div className="grove" />}
        {children}
      </div>
    </div>
  );
}
