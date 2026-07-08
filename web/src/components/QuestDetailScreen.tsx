import type { RunDetail } from "../api/types";
import { CheckpointPrompt } from "./CheckpointPrompt";
import { DialogBox } from "./DialogBox";
import { QuestLog } from "./QuestLog";

function dialogText(detail: RunDetail): string {
  const lastStep = detail.steps[detail.steps.length - 1];
  switch (detail.run.status) {
    case "completed":
      return "任務完成，做得好，勇者！";
    case "failed":
      return "唔……勇者倒下了，這趟任務失敗了。";
    case "rejected":
      return "這份委託被退回了。";
    default:
      return lastStep ? `勇者正在進行：${lastStep.stageId}……` : "勇者整裝待發。";
  }
}

export function QuestDetailScreen({ runId, detail, onBack, onDecided, onApprove }: {
  runId: string;
  detail: RunDetail;
  onBack: () => void;
  onDecided: () => void;
  onApprove: () => void;
}) {
  const pending = detail.checkpoints.find((checkpoint) => checkpoint.decision === "pending") ?? null;

  return (
    <div className="detail-screen">
      <button type="button" className="detail-back" onClick={onBack}>
        ← 返回大廳
      </button>
      <QuestLog steps={detail.steps} />
      {pending ? (
        <CheckpointPrompt
          runId={runId}
          checkpoint={pending}
          onDecided={onDecided}
          onApprove={onApprove}
        />
      ) : (
        <DialogBox speaker="公會主" portraitKey="npc-master" typewriter>
          {dialogText(detail)}
        </DialogBox>
      )}
    </div>
  );
}
