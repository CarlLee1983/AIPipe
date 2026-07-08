import type { ReactNode } from "react";

export function DialogBox({ speaker, children }: { speaker?: string; children: ReactNode }) {
  return (
    <div className="ct-window" style={{ fontSize: 14, lineHeight: 1.7 }}>
      {speaker && <span className="ct-who">{speaker}：</span>}
      {children}
    </div>
  );
}
