import type { StepRecord } from "../api/types";

type StepStatus = StepRecord["status"];

export function stepStatusLabel(status: StepStatus): string {
  switch (status) {
    case "running":
      return "⚔️ 挑戰中";
    case "completed":
      return "✅ 突破";
    case "failed":
      return "💀 失敗";
    case "pending":
      return "⏳ 等待";
  }
}

export function QuestLog({ steps }: { steps: StepRecord[] }) {
  return (
    <div className="ct-window quest-log">
      <h4>冒險日誌</h4>
      {steps.length === 0 ? (
        <div className="quest-empty">勇者尚未踏上旅程……</div>
      ) : (
        <ol className="quest-log-list">
          {steps.map((step, index) => (
            <li key={step.id} className={`quest-stage quest-stage-${step.status}`}>
              <div className="quest-stage-head">
                <span className="ct-hl">第 {index + 1} 關</span>
                <span className="quest-stage-id">{step.stageId}</span>
                <span className="quest-stage-status">{stepStatusLabel(step.status)}</span>
              </div>
              {step.output && <pre className="quest-stage-output">{step.output}</pre>}
              {step.error && <pre className="quest-stage-error">{step.error}</pre>}
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
