import { test, expect } from "bun:test";
import { WorkflowSchema } from "../../src/schema/workflow";

const valid = {
  name: "write-blog-post",
  stages: [{ id: "research", agent: { prompt: "hi" } }],
};

test("合法 workflow 解析成功並套用預設", () => {
  const wf = WorkflowSchema.parse(valid);
  expect(wf.name).toBe("write-blog-post");
  expect(wf.inputs).toEqual([]); // inputs 預設空陣列
  expect(wf.stages[0].agent.prompt).toBe("hi");
});

test("input.required 預設為 false", () => {
  const wf = WorkflowSchema.parse({
    ...valid,
    inputs: [{ name: "topic" }],
  });
  expect(wf.inputs[0].required).toBe(false);
});

test("name 非 kebab-case 應失敗", () => {
  const r = WorkflowSchema.safeParse({ ...valid, name: "Write Blog" });
  expect(r.success).toBe(false);
});

test("stages 為空應失敗", () => {
  const r = WorkflowSchema.safeParse({ ...valid, stages: [] });
  expect(r.success).toBe(false);
});

test("stage 缺 agent 應失敗", () => {
  const r = WorkflowSchema.safeParse({ ...valid, stages: [{ id: "x" }] });
  expect(r.success).toBe(false);
});
