import { useCallback, useEffect, useState } from "react";
import { api } from "../api/client";
import type { Run, WorkflowSummary } from "../api/types";
import { useRun } from "../hooks/useRun";
import { useRunEvents } from "../hooks/useRunEvents";
import { CheckpointPrompt } from "./CheckpointPrompt";
import { DialogBox } from "./DialogBox";
import { HudBar } from "./HudBar";
import { NewQuestForm } from "./NewQuestForm";
import { QuestMenu } from "./QuestMenu";
import { Scene } from "./Scene";
import { Sprite } from "./Sprite";

export function Hall() {
  const [workflows, setWorkflows] = useState<WorkflowSummary[]>([]);
  const [runs, setRuns] = useState<Run[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const { detail, reload } = useRun(selectedId);

  const loadRuns = useCallback(() => {
    api.listRuns().then(setRuns).catch((error) => console.error("載入任務清單失敗：", error));
  }, []);

  useEffect(() => {
    api.listWorkflows().then(setWorkflows).catch((error) => console.error("載入 workflow 失敗：", error));
    loadRuns();
  }, [loadRuns]);

  const onEvent = useCallback(() => {
    reload();
    loadRuns();
  }, [loadRuns, reload]);
  useRunEvents(selectedId, onEvent);

  const pending = detail?.checkpoints.find((checkpoint) => checkpoint.decision === "pending") ?? null;
  const lastStep = detail?.steps[detail.steps.length - 1];

  return (
    <div style={{ maxWidth: 760, margin: "0 auto", display: "grid", gap: 12, padding: 12 }}>
      <HudBar title="勇者公會大廳" />
      <div style={{ display: "grid", gridTemplateColumns: "1fr minmax(220px, 260px)", gap: 12 }}>
        <Scene>
          <Sprite assetKey="npc-master" label="NPC 公會主" className="" />
          <Sprite assetKey="player" label="玩家角色" className="" />
        </Scene>
        <div style={{ display: "grid", gap: 12 }}>
          <QuestMenu runs={runs} selectedId={selectedId} onSelect={setSelectedId} />
          <NewQuestForm workflows={workflows} onCreated={(id) => { setSelectedId(id); loadRuns(); }} />
        </div>
      </div>
      {selectedId && detail && (
        pending ? (
          <CheckpointPrompt runId={selectedId} checkpoint={pending} onDecided={() => { reload(); loadRuns(); }} />
        ) : (
          <DialogBox speaker="公會主">
            {detail.run.status === "completed"
              ? "任務完成，做得好，勇者！"
              : detail.run.status === "failed"
                ? "唔……勇者倒下了，這趟任務失敗了。"
                : detail.run.status === "rejected"
                  ? "這份委託被退回了。"
                  : lastStep
                    ? `勇者正在進行：${lastStep.stageId}……`
                    : "勇者整裝待發。"}
          </DialogBox>
        )
      )}
    </div>
  );
}
