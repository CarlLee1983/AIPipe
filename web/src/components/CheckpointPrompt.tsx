import { useState } from "react";
import { api } from "../api/client";
import type { CheckpointRecord } from "../api/types";
import { DialogBox } from "./DialogBox";

export function CheckpointPrompt({ runId, checkpoint, onDecided, onApprove }: {
  runId: string;
  checkpoint: CheckpointRecord;
  onDecided: () => void;
  onApprove?: () => void;
}) {
  const [busy, setBusy] = useState(false);

  const decide = async (approve: boolean) => {
    setBusy(true);
    try {
      if (approve) {
        await api.approve(runId);
        onApprove?.();
      } else {
        await api.reject(runId);
      }
      onDecided();
    } catch (error) {
      console.error("決策失敗：", error);
    } finally {
      setBusy(false);
    }
  };

  return (
    <DialogBox speaker="公會主" portraitKey="portrait-master">
      {checkpoint.prompt}
      <div style={{ marginTop: 8 }}>
        <button
          disabled={busy}
          onClick={() => decide(true)}
          className="ct-hl"
          style={{ background: "none", border: "none", cursor: "pointer", font: "inherit", color: "#bff4ff" }}
        >
          ▶ 核可
        </button>
        <button
          disabled={busy}
          onClick={() => decide(false)}
          style={{ background: "none", border: "none", cursor: "pointer", font: "inherit", color: "#fff", marginLeft: 16 }}
        >
          駁回
        </button>
      </div>
    </DialogBox>
  );
}
