import { test, expect } from "bun:test";
import { interpolate, withOutput, resolveInputs } from "../../src/engine/context";
import type { Workflow } from "../../src/schema/workflow";

test("interpolate 取代已定義變數", () => {
  const r = interpolate("嗨 {{name}}", { name: "Bun" });
  expect(r.text).toBe("嗨 Bun");
  expect(r.missing).toEqual([]);
});

test("interpolate 未定義變數以空字串代入並記錄", () => {
  const r = interpolate("值={{x}}!", {});
  expect(r.text).toBe("值=!");
  expect(r.missing).toEqual(["x"]);
});

test("withOutput 回傳新物件不改原輸入", () => {
  const base = { a: "1" };
  const next = withOutput(base, "b", "2");
  expect(next).toEqual({ a: "1", b: "2" });
  expect(base).toEqual({ a: "1" }); // 原物件不變
  expect(next).not.toBe(base);
});

const wf = {
  name: "demo",
  inputs: [
    { name: "topic", required: true },
    { name: "lang", required: false, default: "zh" },
  ],
  stages: [{ id: "a", agent: { prompt: "x" } }],
} as unknown as Workflow;

test("resolveInputs 套用預設值", () => {
  const ctx = resolveInputs(wf, { topic: "Bun" });
  expect(ctx).toEqual({ topic: "Bun", lang: "zh" });
});

test("resolveInputs 缺 required 擲錯", () => {
  expect(() => resolveInputs(wf, {})).toThrow(/topic/);
});
