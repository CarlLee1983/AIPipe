import { test, expect } from "bun:test";
import { CreateRunSchema, ResumeRunSchema, validateBody } from "../../src/server/validation";

test("CreateRunSchema 合法輸入帶預設值", () => {
  const res = validateBody(CreateRunSchema, { workflow: "demo" });
  expect(res.success).toBe(true);
  if (res.success) {
    expect(res.data).toEqual({ workflow: "demo", inputs: {}, source: "api" });
  }
});

test("CreateRunSchema 缺 workflow 失敗", () => {
  const res = validateBody(CreateRunSchema, { inputs: {} });
  expect(res.success).toBe(false);
  if (!res.success) {
    expect(res.error).toContain("workflow");
  }
});

test("CreateRunSchema inputs 值非字串失敗", () => {
  const res = validateBody(CreateRunSchema, { workflow: "demo", inputs: { count: 123 } });
  expect(res.success).toBe(false);
  if (!res.success) {
    expect(res.error).toContain("inputs");
  }
});

test("ResumeRunSchema 合法 approve/reject", () => {
  expect(validateBody(ResumeRunSchema, { approve: true }).success).toBe(true);
  expect(validateBody(ResumeRunSchema, { approve: false, note: "偏不" }).success).toBe(true);
});

test("ResumeRunSchema 缺 approve 失敗", () => {
  const res = validateBody(ResumeRunSchema, { note: "x" });
  expect(res.success).toBe(false);
});
