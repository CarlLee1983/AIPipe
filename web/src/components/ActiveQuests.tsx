import { useEffect, useState } from "react";
import type { ApiClient, Run } from "../client";
import { RunView } from "./RunView";

export interface ActiveQuestsProps {
  client: ApiClient;
  initialRunId?: string;
}

export function ActiveQuests({ client, initialRunId }: ActiveQuestsProps) {
  const [runs, setRuns] = useState<Run[]>([]);
  const [selectedRunId, setSelectedRunId] = useState<string | undefined>(initialRunId);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (initialRunId) {
      setSelectedRunId(initialRunId);
    }
  }, [initialRunId]);

  useEffect(() => {
    let isMounted = true;
    async function fetchRuns() {
      try {
        const list = await client.listRuns();
        if (isMounted) {
          setRuns(list);
          setError(null);
          setLoading(false);
        }
      } catch (err: unknown) {
        if (isMounted) {
          const msg = err instanceof Error ? err.message : "載入委託清單失敗";
          setError(msg);
          setLoading(false);
        }
      }
    }

    fetchRuns();
    const interval = setInterval(fetchRuns, 3000);
    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, [client]);

  useEffect(() => {
    if (!selectedRunId && runs.length > 0) {
      const active = runs.find((r) => r.status === "running" || r.status === "paused" || r.status === "pending");
      if (active) {
        setSelectedRunId(active.id);
      } else {
        setSelectedRunId(runs[0].id);
      }
    }
  }, [runs, selectedRunId]);

  return (
    <div className="active-quests-container">
      {error && <div className="status-error" style={{ marginBottom: "1rem" }}>⚠️ {error}</div>}
      
      <div className="active-quests-layout">
        <aside className="run-list-sidebar">
          <h3>⚔️ 委託列表 (Quests)</h3>
          <div className="run-list">
            {loading && runs.length === 0 ? (
              <div className="run-list-loading">⏳ 讀取委託清單中...</div>
            ) : runs.length === 0 ? (
              <div className="empty-run-list">目前無任何委託紀錄</div>
            ) : (
              runs.map((r) => (
                <div
                  key={r.id}
                  className={`run-list-item ${r.id === selectedRunId ? "selected" : ""} ${r.status}`}
                  onClick={() => setSelectedRunId(r.id)}
                >
                  <div className="run-item-header">
                    <strong>{r.workflowName}</strong>
                    <span className={`status-dot ${r.status}`} title={r.status} />
                  </div>
                  <div className="run-item-meta">
                    <span>ID: {r.id.slice(0, 8)}</span>
                    <span className="run-item-status">{r.status}</span>
                  </div>
                  <div className="run-item-date">
                    {new Date(r.createdAt).toLocaleString()}
                  </div>
                </div>
              ))
            )}
          </div>
        </aside>

        <main className="run-view-container">
          {selectedRunId ? (
            <RunView client={client} runId={selectedRunId} />
          ) : (
            <div className="no-run-selected">
              <h3>👈 請從左側選取一個委託以檢視冒險實況</h3>
              <p>點選列表中的任何委託，即可透過水晶球即時觀看 AI 冒險夥伴的挑戰狀態！</p>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
