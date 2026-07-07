import { test, expect } from "bun:test";
import { MockDriver } from "../../src/driver/mock";

test("依序回傳預錄輸出並記錄呼叫", async () => {
  const driver = new MockDriver([
    { output: "第一次" },
    { output: "第二次", success: false },
  ]);

  const r1 = await driver.run({ prompt: "a" });
  const r2 = await driver.run({ prompt: "b" });

  expect(r1.output).toBe("第一次");
  expect(r1.success).toBe(true); // success 預設 true
  expect(r2.success).toBe(false);
  expect(driver.calls.map((c) => c.prompt)).toEqual(["a", "b"]);
});

test("函式模式依 input 回應", async () => {
  const driver = new MockDriver((input) => ({ output: input.prompt.toUpperCase() }));
  const r = await driver.run({ prompt: "hi" });
  expect(r.output).toBe("HI");
});

test("回應用盡後擲錯", async () => {
  const driver = new MockDriver([{ output: "only" }]);
  await driver.run({ prompt: "a" });
  expect(driver.run({ prompt: "b" })).rejects.toThrow(/MockDriver/);
});
