import { useCallback, useEffect, useState } from "react";
import { api } from "../api/client";
import type { Run, WorkflowSummary } from "../api/types";
import { useRun } from "../hooks/useRun";
import { useRunEvents } from "../hooks/useRunEvents";
import { useSfx } from "../hooks/useSfx";
import { HudBar } from "./HudBar";
import { NewQuestForm } from "./NewQuestForm";
import { QuestMenu } from "./QuestMenu";
import { QuestDetailScreen } from "./QuestDetailScreen";
import { Scene } from "./Scene";
import { Sprite } from "./Sprite";

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
      {selectedId && detail && (
        <QuestDetailScreen
          runId={selectedId}
          detail={detail}
          onBack={() => setSelectedId(null)}
          onDecided={() => { reload(); loadRuns(); }}
          onApprove={() => play("sfx-confirm")}
        />
      )}
    </div>
  );
}
