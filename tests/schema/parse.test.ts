import { test, expect } from "bun:test";
import { loadWorkflowFromString } from "../../src/schema/parse";

const yaml = `
name: demo
inputs:
  - name: topic
    required: true
stages:
  - id: research
    agent:
      prompt: "研究 {{topic}}"
    output: notes
  - id: draft
    agent:
      prompt: "根據 {{notes}} 撰稿"
    output: draft
`;

test("載入合法 YAML 回傳 workflow 且無警告", () => {
  const { workflow, warnings } = loadWorkflowFromString(yaml);
  expect(workflow.name).toBe("demo");
  expect(workflow.stages).toHaveLength(2);
  expect(warnings).toEqual([]);
});

test("重複 stage id 擲錯", () => {
  const dup = `
name: demo
stages:
  - id: a
    agent: { prompt: "x" }
  - id: a
    agent: { prompt: "y" }
`;
  expect(() => loadWorkflowFromString(dup)).toThrow(/stage id .*a.* 重複/);
});

test("output 與 input 名衝突擲錯", () => {
  const clash = `
name: demo
inputs:
  - name: topic
stages:
  - id: a
    agent: { prompt: "x" }
    output: topic
`;
  expect(() => loadWorkflowFromString(clash)).toThrow(/output .*topic.* 衝突/);
});

test("重複 output 名擲錯", () => {
  const dup = `
name: demo
stages:
  - id: a
    agent: { prompt: "x" }
    output: notes
  - id: b
    agent: { prompt: "y" }
    output: notes
`;
  expect(() => loadWorkflowFromString(dup)).toThrow(/output .*notes.* 重複/);
});

test("引用未定義變數 → 警告非致命", () => {
  const undef = `
name: demo
stages:
  - id: a
    agent: { prompt: "用 {{missing}} 做事" }
`;
  const { warnings } = loadWorkflowFromString(undef);
  expect(warnings.some((w) => w.includes("missing"))).toBe(true);
});

test("YAML 語法錯誤擲錯", () => {
  expect(() => loadWorkflowFromString("name: [unclosed")).toThrow();
});
