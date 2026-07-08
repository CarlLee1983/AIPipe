import type { Run, RunStatus } from "../api/types";

export function statusLabel(status: RunStatus): string {
  switch (status) {
    case "running":
      return "執行中";
    case "paused":
      return "待核可";
    case "completed":
      return "完成";
    case "rejected":
      return "駁回";
    case "failed":
      return "失敗";
    case "pending":
      return "準備中";
  }
}

export function QuestMenu({ runs, selectedId, onSelect }: {
  runs: Run[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  return (
    <div className="ct-window">
      <h4>任務佈告欄</h4>
      {runs.length === 0 && <div style={{ fontSize: 11 }}>（尚無任務，點「發任務」開始）</div>}
      {runs.map((run) => (
        <button
          key={run.id}
          type="button"
          onClick={() => onSelect(run.id)}
          style={{
            width: "100%",
            display: "flex",
            alignItems: "center",
            gap: 6,
            font: "inherit",
            fontSize: 11,
            padding: "3px 2px",
            color: "inherit",
            background: "none",
            border: 0,
            cursor: "pointer",
          }}
        >
          <span className="ct-cursor" style={{ width: 12, visibility: run.id === selectedId ? "visible" : "hidden" }}>
            ▶
          </span>
          {run.workflowName}
          <span style={{ marginLeft: "auto", fontSize: 9 }}>{statusLabel(run.status)}</span>
        </button>
      ))}
    </div>
  );
}
