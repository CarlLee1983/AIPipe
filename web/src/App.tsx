import { useEffect, useMemo, useState } from "react";
import { createClient, type Run } from "./client";
import { QuestBoard } from "./components/QuestBoard";
import "./App.css";

type TabType = "new-quest" | "active-quests" | "history";
type ConnectionStatus = "connecting" | "connected" | "disconnected";

export default function App() {
  const [activeTab, setActiveTab] = useState<TabType>("new-quest");
  const [status, setStatus] = useState<ConnectionStatus>("connecting");
  const [runs, setRuns] = useState<Run[]>([]);

  const client = useMemo(() => createClient(), []);

  useEffect(() => {
    let isMounted = true;

    async function fetchData() {
      try {
        const runList = await client.listRuns();
        if (isMounted) {
          setRuns(runList);
          setStatus("connected");
        }
      } catch (err) {
        if (isMounted) {
          setStatus("disconnected");
        }
      }
    }

    fetchData();
    const interval = setInterval(fetchData, 5000);
    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, [client]);

  const activeRuns = useMemo(
    () =>
      runs.filter(
        (r) => r.status === "running" || r.status === "paused" || r.status === "pending"
      ),
    [runs]
  );

  const historyRuns = useMemo(
    () =>
      runs.filter(
        (r) => r.status === "completed" || r.status === "rejected" || r.status === "failed"
      ),
    [runs]
  );

  const statusLabel =
    status === "connected"
      ? "已連線 (Connected)"
      : status === "connecting"
      ? "連線中... (Connecting)"
      : "連線中斷 (Disconnected)";

  return (
    <div className="guild-hall">
      <header className="guild-header">
        <h1 className="guild-title">🛡️ AI 勇者大廳 (AI Hero Hall)</h1>
        <div className="status-bar">
          <span className={`status-indicator ${status}`} />
          <span>{statusLabel}</span>
        </div>
      </header>

      <nav className="guild-nav">
        <button
          className={`tab-btn ${activeTab === "new-quest" ? "active" : ""}`}
          onClick={() => setActiveTab("new-quest")}
        >
          📜 委託任務板 (New Quest)
        </button>
        <button
          className={`tab-btn ${activeTab === "active-quests" ? "active" : ""}`}
          onClick={() => setActiveTab("active-quests")}
        >
          ⚔️ 進行中委託 (Active Quests) ({activeRuns.length})
        </button>
        <button
          className={`tab-btn ${activeTab === "history" ? "active" : ""}`}
          onClick={() => setActiveTab("history")}
        >
          🏆 冒險紀錄 (History) ({historyRuns.length})
        </button>
      </nav>

      <main className="guild-content">
        {activeTab === "new-quest" && (
          <section>
            <h2 className="panel-title">接取委託 / 任務板</h2>
            <QuestBoard
              client={client}
              onQuestStarted={() => {
                setActiveTab("active-quests");
              }}
            />
          </section>
        )}

        {activeTab === "active-quests" && (
          <section>
            <h2 className="panel-title">進行中任務</h2>
            {activeRuns.length === 0 ? (
              <div className="empty-state">
                目前沒有正在執行中的冒險委託。
              </div>
            ) : (
              <div className="quest-list">
                {activeRuns.map((r) => (
                  <div key={r.id} className="quest-card">
                    <div>
                      <h3>{r.workflowName}</h3>
                      <p>委託編號: {r.id.slice(0, 8)}</p>
                    </div>
                    <div className="quest-meta">
                      <span className={`status-badge ${r.status}`}>
                        {r.status}
                      </span>
                      <span>階段: {r.currentStageIndex}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        )}

        {activeTab === "history" && (
          <section>
            <h2 className="panel-title">歷史冒險</h2>
            {historyRuns.length === 0 ? (
              <div className="empty-state">
                公會檔案庫中暫無歷史冒險紀錄。
              </div>
            ) : (
              <div className="quest-list">
                {historyRuns.map((r) => (
                  <div key={r.id} className="quest-card">
                    <div>
                      <h3>{r.workflowName}</h3>
                      <p>委託編號: {r.id.slice(0, 8)}</p>
                    </div>
                    <div className="quest-meta">
                      <span className={`status-badge ${r.status}`}>
                        {r.status}
                      </span>
                      <span>{new Date(r.createdAt).toLocaleDateString()}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        )}
      </main>

      <footer className="guild-footer">
        <p>AI 代理人協作公會系統 (AI Agent Collaboration Guild System)</p>
      </footer>
    </div>
  );
}
