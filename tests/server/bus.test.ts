import { test, expect } from "bun:test";
import { EventBus, type ServerEvent } from "../../src/server/events/bus";

test("subscribe 收到所有事件；unsubscribe 後不再收到", () => {
  const bus = new EventBus();
  const received: ServerEvent[] = [];
  const unsub = bus.subscribe((e) => received.push(e));

  bus.emit({ type: "run:created", timestamp: 1, data: { runId: "r1", workflowName: "w" } });
  expect(received).toHaveLength(1);

  unsub();
  bus.emit({ type: "run:created", timestamp: 2, data: { runId: "r2", workflowName: "w" } });
  expect(received).toHaveLength(1);
});

test("subscribeRun 只收到指定 runId 的事件", () => {
  const bus = new EventBus();
  const r1Events: ServerEvent[] = [];
  bus.subscribeRun("r1", (e) => r1Events.push(e));

  bus.emit({ type: "run:created", timestamp: 1, data: { runId: "r1", workflowName: "w" } });
  bus.emit({ type: "run:created", timestamp: 2, data: { runId: "r2", workflowName: "w" } });
  bus.emit({ type: "stage:start", timestamp: 3, data: { runId: "r1", stageId: "s", index: 0, prompt: "p" } });

  expect(r1Events).toHaveLength(2);
  expect(r1Events.map((e) => e.timestamp)).toEqual([1, 3]);
});

test("emit 遇到 listener 擲錯不中斷其他 listener", () => {
  const bus = new EventBus();
  const received: string[] = [];
  bus.subscribe(() => { throw new Error("boom"); });
  bus.subscribe(() => received.push("ok"));

  expect(() => bus.emit({ type: "run:created", timestamp: 1, data: { runId: "r1", workflowName: "w" } })).not.toThrow();
  expect(received).toEqual(["ok"]);
});
