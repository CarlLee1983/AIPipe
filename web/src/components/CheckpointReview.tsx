import { useState } from "react";
import type { ApiClient } from "../client";

export interface CheckpointReviewProps {
  client: ApiClient;
  runId: string;
  checkpoint: {
    stepIndex?: number;
    stageIndex?: number;
    stageId?: string;
    prompt: string;
  };
  onResolved: () => void;
}

export function CheckpointReview({ client, runId, checkpoint, onResolved }: CheckpointReviewProps) {
  const [note, setNote] = useState<string>("");
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  async function handleDecision(approve: boolean) {
    setSubmitting(true);
    setError(null);
    try {
      await client.resumeRun(runId, approve, note || undefined);
      onResolved();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "提交決策失敗";
      setError(msg);
      setSubmitting(false);
    }
  }

  return (
    <div className="checkpoint-review review-card">
      <div className="review-header">
        <h3>⚠️ 公會長老審核請求 (Guild Review Required)</h3>
      </div>

      {(checkpoint.stepIndex !== undefined || checkpoint.stageIndex !== undefined || checkpoint.stageId) && (
        <div className="review-meta">
          <span>
            📍 關卡 / 步驟：{checkpoint.stageId || `Step ${(checkpoint.stepIndex ?? checkpoint.stageIndex ?? 0) + 1}`}
          </span>
        </div>
      )}

      <div className="review-prompt-box">
        <label>📜 決策說明 (Prompt)：</label>
        <pre className="review-prompt-text">{checkpoint.prompt}</pre>
      </div>

      <div className="form-group review-note-group">
        <label htmlFor={`checkpoint-note-${runId}`}>📝 備忘錄／指示 (Optional Note)：</label>
        <textarea
          id={`checkpoint-note-${runId}`}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="如：請注意確認金鑰安全..."
          disabled={submitting}
          rows={3}
        />
      </div>

      {error && <div className="status-error" style={{ margin: "0.8rem 0" }}>⚠️ {error}</div>}

      {submitting ? (
        <div className="review-submitting">
          ⏳ 正在將決策印記送往魔法陣...
        </div>
      ) : (
        <div className="review-actions">
          <button
            type="button"
            className="btn-approve"
            onClick={() => handleDecision(true)}
            disabled={submitting}
          >
            🛡️ 授權通過並繼續 (Approve & Resume)
          </button>
          <button
            type="button"
            className="btn-reject"
            onClick={() => handleDecision(false)}
            disabled={submitting}
          >
            🛑 駁回委託並終止 (Reject & Abort)
          </button>
        </div>
      )}
    </div>
  );
}
