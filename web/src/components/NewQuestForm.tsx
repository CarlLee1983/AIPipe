import { useEffect, useState } from "react";
import { api } from "../api/client";
import type { WorkflowSummary } from "../api/types";

export function NewQuestForm({ workflows, onCreated }: {
  workflows: WorkflowSummary[];
  onCreated: (runId: string) => void;
}) {
  const [selected, setSelected] = useState(workflows[0]?.name ?? "");
  const [inputs, setInputs] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const workflow = workflows.find((item) => item.name === selected);

  useEffect(() => {
    if (!selected && workflows[0]) setSelected(workflows[0].name);
  }, [selected, workflows]);

  const submit = async () => {
    if (!selected) return;
    setBusy(true);
    try {
      const { runId } = await api.createRun(selected, inputs);
      onCreated(runId);
    } catch (error) {
      console.error("發任務失敗：", error);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="ct-window">
      <h4>發佈新任務</h4>
      <select value={selected} onChange={(event) => { setSelected(event.target.value); setInputs({}); }}>
        {workflows.map((item) => (
          <option key={item.name} value={item.name}>{item.name}</option>
        ))}
      </select>
      {workflow?.inputs.map((input) => (
        <div key={input.name} style={{ marginTop: 6 }}>
          <label htmlFor={input.name} style={{ fontSize: 11 }}>{input.name}{input.required ? " *" : ""}</label>
          <input
            id={input.name}
            aria-label={input.name}
            value={inputs[input.name] ?? ""}
            onChange={(event) => setInputs((prev) => ({ ...prev, [input.name]: event.target.value }))}
          />
        </div>
      ))}
      <button disabled={busy || !selected} onClick={submit} style={{ marginTop: 8 }}>發佈任務</button>
    </div>
  );
}
