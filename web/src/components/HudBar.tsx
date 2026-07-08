export function HudBar({ title }: { title: string }) {
  return (
    <div className="ct-window" style={{ display: "flex", alignItems: "center", gap: 14, borderRadius: 8 }}>
      <span className="ct-who">{title}</span>
      <span className="ct-hl">指令：▶ 發任務　名冊　記錄</span>
    </div>
  );
}
