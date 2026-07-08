import { useCallback, useEffect, useState } from "react";
import { api } from "../api/client";
import type { Run, WorkflowSummary } from "../api/types";
import { useRun } from "../hooks/useRun";
import { useRunEvents } from "../hooks/useRunEvents";
import { useSfx } from "../hooks/useSfx";
import { CheckpointPrompt } from "./CheckpointPrompt";
import { DialogBox } from "./DialogBox";
import { HudBar } from "./HudBar";
import { NewQuestForm } from "./NewQuestForm";
import { QuestLog } from "./QuestLog";
import { QuestMenu } from "./QuestMenu";
import { Scene } from "./Scene";
import { Sprite } from "./Sprite";

function dialogText(detail: NonNullable<ReturnType<typeof useRun>["detail"]>): string {
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

export function Hall() {
  const [workflows, setWorkflows] = useState<WorkflowSummary[]>([]);
  const [runs, setRuns] = useState<Run[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const { detail, reload } = useRun(selectedId);
  const { muted, toggle, play } = useSfx();

  const loadRuns = useCallback(() => {
    api.listRuns().then(setRuns).catch((error) => console.error("載入任務清單失敗：", error));
  }, []);

  useEffect(() => {
    api.listWorkflows().then(setWorkflows).catch((error) => console.error("載入 workflow 失敗：", error));
    loadRuns();
  }, [loadRuns]);

  const onEvent = useCallback((type: string) => {
    if (type === "run:done") play("sfx-complete");
    reload();
    loadRuns();
  }, [loadRuns, play, reload]);
  useRunEvents(selectedId, onEvent);

  const selectRun = useCallback((id: string) => {
    play("sfx-cursor");
    setSelectedId(id);
  }, [play]);

  const pending = detail?.checkpoints.find((checkpoint) => checkpoint.decision === "pending") ?? null;

  return (
    <div className="hall-shell">
      <HudBar title="勇者公會大廳" muted={muted} onToggleSfx={toggle} />
      <div className="hall-layout">
        <Scene>
          <Sprite assetKey="npc-master" label="NPC 公會主" className="sprite sprite-npc" />
          <Sprite assetKey="player" label="玩家角色" className="sprite sprite-player" />
        </Scene>
        <div className="hall-sidebar">
          <QuestMenu runs={runs} selectedId={selectedId} onSelect={selectRun} />
          <NewQuestForm workflows={workflows} onCreated={(id) => { setSelectedId(id); loadRuns(); }} />
        </div>
      </div>
      {selectedId && detail && <QuestLog steps={detail.steps} />}
      {selectedId && detail && (
        pending ? (
          <CheckpointPrompt
            runId={selectedId}
            checkpoint={pending}
            onDecided={() => { reload(); loadRuns(); }}
            onApprove={() => play("sfx-confirm")}
          />
        ) : (
          <DialogBox speaker="公會主" portraitKey="portrait-master" typewriter>
            {dialogText(detail)}
          </DialogBox>
        )
      )}
    </div>
  );
}
