import React, { useEffect, useState } from "react";
import type { ApiClient, WorkflowSummary } from "../client";
import { QuestCard } from "./QuestCard";

export interface QuestBoardProps {
  client: ApiClient;
  onQuestStarted: (runId: string) => void;
}

export function QuestBoard({ client, onQuestStarted }: QuestBoardProps) {
  const [workflows, setWorkflows] = useState<WorkflowSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedWf, setSelectedWf] = useState<WorkflowSummary | null>(null);
  const [formInputs, setFormInputs] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let isMounted = true;
    client.listWorkflows()
      .then((list) => {
        if (isMounted) {
          setWorkflows(list);
          setLoading(false);
        }
      })
      .catch((err) => {
        if (isMounted) {
          setError(err.message || "載入任務板失敗");
          setLoading(false);
        }
      });
    return () => {
      isMounted = false;
    };
  }, [client]);

  const handleSelect = (wf: WorkflowSummary) => {
    setSelectedWf(wf);
    setError(null);
    const initial: Record<string, string> = {};
    if (wf.inputs) {
      for (const inp of wf.inputs) {
        if (inp.default !== undefined) {
          initial[inp.name] = inp.default;
        } else {
          initial[inp.name] = "";
        }
      }
    }
    setFormInputs(initial);
  };

  const handleInputChange = (name: string, val: string) => {
    setFormInputs((prev) => ({ ...prev, [name]: val }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedWf) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await client.createRun(selectedWf.name, formInputs);
      setSelectedWf(null);
      onQuestStarted(res.runId);
    } catch (err: any) {
      setError(err.message || "啟動委託失敗");
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) return <div className="status-loading">⏳ 正在從魔法陣讀取公會委託清單...</div>;
  if (error && !workflows.length) return <div className="status-error">❌ {error}</div>;

  return (
    <div className="quest-board-container">
      {error && !selectedWf && <div className="status-error" style={{ marginBottom: "1rem" }}>⚠️ {error}</div>}

      <div className="quest-grid">
        {workflows.map((wf) => (
          <QuestCard key={wf.name} workflow={wf} onSelect={handleSelect} />
        ))}
        {workflows.length === 0 && <div className="empty-notice">目前公會任務板上空無一物，請稍後再來！</div>}
      </div>

      {selectedWf && (
        <div className="quest-modal-overlay">
          <div className="quest-modal">
            <div className="quest-modal-header">
              <h2>⚔️ 簽署委託契約：{selectedWf.name}</h2>
              <button className="btn-close" onClick={() => { setSelectedWf(null); setError(null); }}>✖</button>
            </div>
            <p className="quest-modal-desc">{selectedWf.description || "請填寫以下情報，冒險隊伍將立即出發。"}</p>
            {error && <div className="status-error" style={{ marginBottom: "1rem" }}>⚠️ {error}</div>}

            <form onSubmit={handleSubmit} className="quest-form">
              {selectedWf.inputs && selectedWf.inputs.length > 0 ? (
                selectedWf.inputs.map((inp) => (
                  <div key={inp.name} className="form-group">
                    <label htmlFor={`input-${inp.name}`}>
                      {inp.name} {inp.required && <span className="required-mark">* (必填)</span>}
                    </label>
                    <textarea
                      id={`input-${inp.name}`}
                      rows={3}
                      required={inp.required}
                      value={formInputs[inp.name] || ""}
                      onChange={(e) => handleInputChange(inp.name, e.target.value)}
                      placeholder={`請輸入 ${inp.name}...`}
                    />
                  </div>
                ))
              ) : (
                <p className="no-inputs-notice">此任務不需額外情報，可以直接出發！</p>
              )}

              <div className="quest-form-actions">
                <button type="button" className="btn-cancel" onClick={() => { setSelectedWf(null); setError(null); }} disabled={submitting}>
                  取消 (Cancel)
                </button>
                <button type="submit" className="btn-launch" disabled={submitting}>
                  {submitting ? "⏳ 正在啟動魔法陣..." : "⚔️ 簽署委託並出發 (Launch Quest)"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
