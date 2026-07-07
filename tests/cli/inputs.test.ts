import { test, expect } from "bun:test";
import { parseInputPairs } from "../../src/cli/inputs";
import { buildDeps } from "../../src/cli/deps";
import { MockDriver } from "../../src/driver/mock";

test("解析 k=v，值含空白與等號", () => {
  expect(parseInputPairs(["topic=Bun 入門", "eq=a=b"])).toEqual({
    topic: "Bun 入門",
    eq: "a=b",
  });
});

test("空陣列回空物件", () => {
  expect(parseInputPairs([])).toEqual({});
});

test("缺 = 擲錯", () => {
  expect(() => parseInputPairs(["bad"])).toThrow(/bad/);
});

test("buildDeps 用 :memory: 與注入 driver 組出可用 deps", () => {
  const d = buildDeps({ dbPath: ":memory:", driver: new MockDriver([]) });
  const run = d.runs.create({ workflowName: "demo", workflowSnapshot: "x", inputs: {}, context: {} });
  expect(d.runs.get(run.id)!.workflowName).toBe("demo");
});
