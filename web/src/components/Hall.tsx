import { useCallback, useEffect, useState } from "react";
import { api } from "../api/client";
import type { Run, WorkflowSummary } from "../api/types";
import { useRun } from "../hooks/useRun";
import { useRunEvents } from "../hooks/useRunEvents";
import { useSfx } from "../hooks/useSfx";
import { CommandBar, type LobbyCommand } from "./CommandBar";
import { HudBar } from "./HudBar";
import { NewQuestForm } from "./NewQuestForm";
import { OverlayWindow } from "./OverlayWindow";
import { QuestDetailScreen } from "./QuestDetailScreen";
import { QuestMenu } from "./QuestMenu";
import { Scene } from "./Scene";
import { Sprite } from "./Sprite";

type Screen = "lobby" | "detail";

export function Hall() {
  const [workflows, setWorkflows] = useState<WorkflowSummary[]>([]);
  const [runs, setRuns] = useState<Run[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [screen, setScreen] = useState<Screen>("lobby");
  const [lobbyMenu, setLobbyMenu] = useState<LobbyCommand | null>(null);
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

  const openQuest = useCallback((id: string) => {
    play("sfx-cursor");
    setSelectedId(id);
    setScreen("detail");
    setLobbyMenu(null);
  }, [play]);

  const openMenu = useCallback((command: LobbyCommand) => {
    play("sfx-cursor");
    setLobbyMenu(command);
  }, [play]);

  return (
    <div className="hall-shell">
      <div className="cabinet">
        <Scene>
          <Sprite assetKey="npc-master" label="NPC 公會主" className="sprite sprite-npc" />
          <Sprite assetKey="player" label="玩家角色" className="sprite sprite-player" />
        </Scene>

        <HudBar title="勇者公會大廳" muted={muted} onToggleSfx={toggle} />

        {screen === "lobby" && (
          <>
            <CommandBar onCommand={openMenu} />
            {lobbyMenu === "board" && (
              <OverlayWindow title="任務佈告欄" onClose={() => setLobbyMenu(null)}>
                <QuestMenu runs={runs} selectedId={selectedId} onSelect={openQuest} />
              </OverlayWindow>
            )}
            {lobbyMenu === "new" && (
              <OverlayWindow title="發佈新任務" onClose={() => setLobbyMenu(null)}>
                <NewQuestForm workflows={workflows} onCreated={(id) => { loadRuns(); openQuest(id); }} />
              </OverlayWindow>
            )}
          </>
        )}

        {screen === "detail" && selectedId && detail && (
          <QuestDetailScreen
            runId={selectedId}
            detail={detail}
            onBack={() => setScreen("lobby")}
            onDecided={() => { reload(); loadRuns(); }}
            onApprove={() => play("sfx-confirm")}
          />
        )}
      </div>
    </div>
  );
}
