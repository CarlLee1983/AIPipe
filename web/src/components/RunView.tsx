import { useEffect, useState } from "react";
import type { ApiClient, ServerEvent } from "../client";
import { CheckpointReview } from "./CheckpointReview";

export interface RunViewProps {
  client: ApiClient;
  runId: string;
}

export interface StageCardData {
  stageId: string;
  index: number;
  name?: string;
  agentName?: string;
  status: "running" | "completed" | "failed" | "pending";
  prompt?: string;
  output?: string;
  error?: string;
}

export interface LogEntry {
  id: string;
  timestamp: number;
  type: string;
  message: string;
}

interface CheckpointData {
  stageId: string;
  stageIndex?: number;
  prompt: string;
  checkpointId: string;
}

export function StageCard({ stage }: { stage: StageCardData }) {
  return (
    <div className={`stage-card ${stage.status}`}>
      <div className="stage-card-header">
        <h4>
          第 {stage.index + 1} 關：{stage.name || stage.stageId}
        </h4>
        <span className={`stage-status-tag ${stage.status}`}>
          {stage.status === "running" && "⏳ 挑戰中 (Running)"}
          {stage.status === "completed" && "✅ 突破成功 (Completed)"}
          {stage.status === "failed" && "💀 挑戰失敗 (Failed)"}
          {stage.status === "pending" && "⏳ 等待中 (Pending)"}
        </span>
      </div>
      {stage.agentName && (
        <div className="stage-agent">
          🧙‍♂️ 負責夥伴 (Agent): <strong>{stage.agentName}</strong>
        </div>
      )}
      {stage.prompt && (
        <div className="stage-prompt">
          <strong>📜 任務指示 (Prompt):</strong>
          <pre>{stage.prompt}</pre>
        </div>
      )}
      {stage.output && (
        <div className="stage-output">
          <strong>💎 產出成果 (Output):</strong>
          <pre>{stage.output}</pre>
        </div>
      )}
      {stage.error && (
        <div className="stage-error">
          <strong>❌ 失敗原因 (Error):</strong>
          <pre>{stage.error}</pre>
        </div>
      )}
    </div>
  );
}

export function LogStream({ logs }: { logs: LogEntry[] }) {
  return (
    <div className="log-stream">
      {logs.length === 0 ? (
        <div className="log-empty">⏳ 魔法捲軸準備就緒，等待事件記錄...</div>
      ) : (
        logs.map((log) => (
          <div key={log.id} className={`log-entry ${log.type.replace(":", "-")}`}>
            <span className="log-time">
              [{new Date(log.timestamp).toLocaleTimeString()}]
            </span>{" "}
            <span className="log-message">{log.message}</span>
          </div>
        ))
      )}
    </div>
  );
}

export function RunView({ client, runId }: RunViewProps) {
  const [status, setStatus] = useState<string>("pending");
  const [workflowName, setWorkflowName] = useState<string>("");
  const [stages, setStages] = useState<StageCardData[]>([]);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [currentCheckpoint, setCurrentCheckpoint] = useState<CheckpointData | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;
    setLoading(true);
    setError(null);
    setStages([]);
    setLogs([]);
    setCurrentCheckpoint(null);
    setStatus("pending");

    // 1. Fetch initial run state
    client.getRun(runId)
      .then((detail) => {
        if (!isMounted) return;
        setStatus(detail.run.status);
        setWorkflowName(detail.run.workflowName);

        const initialStages: StageCardData[] = detail.steps.map((s) => ({
          stageId: s.stageId,
          index: s.stageIndex,
          agentName: s.agentName,
          status: s.status === "completed" ? "completed" : s.status === "failed" ? "failed" : s.status === "pending" ? "pending" : "running",
          prompt: s.input,
          output: s.output,
          error: s.error,
        }));

        setStages((prev) => {
          const merged = [...prev];
          for (const initStage of initialStages) {
            const idx = merged.findIndex((s) => s.stageId === initStage.stageId || s.index === initStage.index);
            if (idx === -1) {
              merged.push(initStage);
            } else {
              const existing = merged[idx];
              if (existing.status === "completed" || existing.status === "failed") {
                continue;
              }
              merged[idx] = { ...initStage, ...existing };
            }
          }
          return merged.sort((a, b) => a.index - b.index);
        });

        const pendingCp = detail.checkpoints.find((c) => c.status === "pending") ||
          (detail.run.status === "paused" ? detail.checkpoints[detail.checkpoints.length - 1] : undefined);
        if (pendingCp) {
          setCurrentCheckpoint({
            stageId: `stage-${pendingCp.stageIndex}`,
            stageIndex: pendingCp.stageIndex,
            prompt: pendingCp.prompt,
            checkpointId: pendingCp.id,
          });
        }
        setLoading(false);
      })
      .catch((err) => {
        if (!isMounted) return;
        setError(err.message || "載入冒險資訊失敗");
        setLoading(false);
      });

    // 2. Subscribe to live SSE events
    const unsubscribe = client.subscribeEvents(
      runId,
      (event: ServerEvent) => {
        if (!isMounted) return;

        // Add to log stream
        const msg = formatLogMessage(event);
        setLogs((prev) => {
          if (prev.some((l) => l.timestamp === event.timestamp && l.type === event.type && l.message === msg)) {
            return prev;
          }
          const entry: LogEntry = {
            id: `${event.type}-${event.timestamp}-${Math.random().toString(36).slice(2, 7)}`,
            timestamp: event.timestamp,
            type: event.type,
            message: msg,
          };
          return [...prev, entry].slice(-300);
        });

        // Update state based on event type
        switch (event.type) {
          case "run:created":
            setWorkflowName(event.data.workflowName);
            break;

          case "stage:start":
            setStages((prev) => {
              const next = [...prev];
              const idx = next.findIndex((s) => s.stageId === event.data.stageId || s.index === event.data.index);
              if (idx === -1) {
                next.push({
                  stageId: event.data.stageId,
                  index: event.data.index,
                  name: event.data.name,
                  status: "running",
                  prompt: event.data.prompt,
                });
              } else {
                next[idx] = {
                  ...next[idx],
                  stageId: event.data.stageId,
                  name: event.data.name || next[idx].name,
                  status: "running",
                  prompt: event.data.prompt,
                };
              }
              return next.sort((a, b) => a.index - b.index);
            });
            break;

          case "stage:done":
            setStages((prev) => {
              const next = [...prev];
              const idx = next.findIndex((s) => s.stageId === event.data.stageId);
              if (idx !== -1) {
                next[idx] = {
                  ...next[idx],
                  status: "completed",
                  output: event.data.output,
                };
              } else {
                next.push({
                  stageId: event.data.stageId,
                  index: prev.length,
                  status: "completed",
                  output: event.data.output,
                });
              }
              return next.sort((a, b) => a.index - b.index);
            });
            break;

          case "run:checkpoint":
            setCurrentCheckpoint({
              stageId: event.data.stageId,
              prompt: event.data.prompt,
              checkpointId: event.data.checkpointId,
            });
            setStatus("paused");
            break;

          case "run:completed":
            setStatus("completed");
            break;

          case "run:failed":
            setStatus("failed");
            if (event.data.stageId) {
              setStages((prev) => {
                const next = [...prev];
                const idx = next.findIndex((s) => s.stageId === event.data.stageId);
                if (idx !== -1) {
                  next[idx] = {
                    ...next[idx],
                    status: "failed",
                    error: event.data.error,
                  };
                }
                return next;
              });
            }
            break;

          case "run:rejected":
            setStatus("rejected");
            break;
        }
      },
      (err) => {
        if (!isMounted) return;
        console.error("SSE error:", err);
      }
    );

    return () => {
      isMounted = false;
      unsubscribe();
    };
  }, [client, runId]);

  function formatLogMessage(event: ServerEvent): string {
    switch (event.type) {
      case "run:created":
        return `⚔️ 冒險委託啟動 (Run Created): ${event.data.workflowName}`;
      case "stage:start":
        return `▶️ 關卡開始 (Stage Start): ${event.data.name || event.data.stageId} (第 ${event.data.index + 1} 關)\n📜 提示: ${event.data.prompt.slice(0, 100)}${event.data.prompt.length > 100 ? "..." : ""}`;
      case "stage:done":
        return `✅ 關卡完成 (Stage Done): ${event.data.stageId}\n💎 成果: ${event.data.output.slice(0, 100)}${event.data.output.length > 100 ? "..." : ""}`;
      case "run:checkpoint":
        return `⚠️ 觸發決策點 (Checkpoint Triggered) [${event.data.stageId}]: ${event.data.prompt}`;
      case "run:completed":
        return `🏆 冒險委託順利完成！(Run Completed)`;
      case "run:failed":
        return `💀 冒險挑戰失敗 (Run Failed) [${event.data.stageId}]: ${event.data.error}`;
      case "run:rejected":
        return `🚫 委託已撤回/拒絕 (Run Rejected)`;
      default:
        return `📢 未知事件`;
    }
  }

  function getStatusBadge(st: string) {
    switch (st) {
      case "running":
        return <span className="status-badge running">⏳ 進行中 (Running)</span>;
      case "paused":
        return <span className="status-badge paused">⏸️ 等待公會決策 (Paused)</span>;
      case "completed":
        return <span className="status-badge completed">🏆 冒險完成 (Completed)</span>;
      case "failed":
        return <span className="status-badge failed">💀 冒險失敗 (Failed)</span>;
      case "rejected":
        return <span className="status-badge rejected">🚫 委託拒絕 (Rejected)</span>;
      case "pending":
      default:
        return <span className="status-badge pending">⏳ 等待出發 (Pending)</span>;
    }
  }

  if (loading && stages.length === 0 && logs.length === 0) {
    return <div className="run-view-loading">⏳ 正在開啟冒險者水晶球，連線至委託實況...</div>;
  }

  return (
    <div className="run-view">
      {error && <div className="status-error" style={{ marginBottom: "1rem" }}>⚠️ {error}</div>}

      <header className="run-view-header">
        <div>
          <h2>⚔️ 冒險實況看板 {workflowName ? `：${workflowName}` : ""}</h2>
          <p className="run-id-label">委託編號: {runId}</p>
        </div>
        <div className="run-view-status">
          {getStatusBadge(status)}
        </div>
      </header>

      {currentCheckpoint && status === "paused" && (
        <CheckpointReview
          client={client}
          runId={runId}
          checkpoint={{
            stageId: currentCheckpoint.stageId,
            stageIndex: currentCheckpoint.stageIndex,
            prompt: currentCheckpoint.prompt,
          }}
          onResolved={() => {
            setStatus((prev) =>
              prev === "completed" || prev === "failed" || prev === "rejected" ? prev : "running"
            );
            setCurrentCheckpoint(null);
          }}
        />
      )}

      <section className="stages-section">
        <h3>🗺️ 冒險關卡進度 (Stage Progress)</h3>
        <div className="stage-list">
          {stages.length === 0 ? (
            <div className="empty-stage-notice">⏳ 冒險隊伍準備中，尚未進入任何關卡...</div>
          ) : (
            stages.map((stage) => (
              <StageCard key={stage.stageId || stage.index} stage={stage} />
            ))
          )}
        </div>
      </section>

      <section className="log-stream-section">
        <h3>📜 冒險日誌 (Live Log Stream)</h3>
        <LogStream logs={logs} />
      </section>
    </div>
  );
}
