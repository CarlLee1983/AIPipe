import type { WorkflowSummary } from "../client";

export interface QuestCardProps {
  workflow: WorkflowSummary;
  onSelect: (wf: WorkflowSummary) => void;
}

export function QuestCard({ workflow, onSelect }: QuestCardProps) {
  const desc = workflow.description || "來自公會長老的高階冒險委託，完成可獲得豐厚報酬與公會聲望。";
  const inputCount = workflow.inputs ? workflow.inputs.length : 0;

  return (
    <div className="quest-card">
      <div className="quest-card-header">
        <h3 className="quest-title">📜 {workflow.name}</h3>
        <span className="quest-badge">{inputCount > 0 ? `需 ${inputCount} 項情報` : "無需額外情報"}</span>
      </div>
      <p className="quest-desc">{desc}</p>
      <div className="quest-card-footer">
        <button className="btn-accept" onClick={() => onSelect(workflow)}>
          ⚔️ 接取委託 (Accept Quest)
        </button>
      </div>
    </div>
  );
}
