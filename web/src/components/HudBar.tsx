export function HudBar({ title, muted, onToggleSfx }: {
  title: string;
  muted: boolean;
  onToggleSfx: () => void;
}) {
  return (
    <div className="ct-window hud-bar">
      <div className="hud-row hud-row-main">
        <span className="ct-who">{title}</span>
        <span className="ct-hl">指令：▶ 發任務　名冊　記錄</span>
        <button
          type="button"
          className="hud-sfx-toggle"
          onClick={onToggleSfx}
          aria-pressed={!muted}
          aria-label={muted ? "開啟音效" : "關閉音效"}
        >
          {muted ? "音效 關" : "音效 開"}
        </button>
      </div>
      <div className="hud-row hud-stats">
        <span>Lv.12</span>
        <span>聲望 叁</span>
        <span>金幣 1,240G</span>
      </div>
    </div>
  );
}
