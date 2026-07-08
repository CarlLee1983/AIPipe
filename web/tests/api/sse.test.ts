import { afterEach, expect, test } from "bun:test";
import { subscribeRun } from "../../src/api/sse";

const known = ["snapshot", "stage:start", "stage:done", "checkpoint", "run:done", "run:failed", "run:rejected", "ping"];

class FakeEventSource {
  static last: FakeEventSource | null = null;
  listeners = new Map<string, (event: MessageEvent) => void>();
  closed = false;

  constructor(public url: string) {
    FakeEventSource.last = this;
  }

  addEventListener(type: string, cb: (event: MessageEvent) => void) {
    this.listeners.set(type, cb);
  }

  close() {
    this.closed = true;
  }

  emit(type: string, data: unknown) {
    this.listeners.get(type)?.({ data: JSON.stringify(data) } as MessageEvent);
  }
}

afterEach(() => {
  FakeEventSource.last = null;
  delete (globalThis as { EventSource?: typeof FakeEventSource }).EventSource;
});

test("subscribeRun 註冊所有事件並轉發", () => {
  (globalThis as { EventSource?: typeof FakeEventSource }).EventSource = FakeEventSource;
  const got: [string, unknown][] = [];
  const off = subscribeRun("r1", (type, data) => got.push([type, data]));
  const es = FakeEventSource.last!;
  for (const type of known) expect(es.listeners.has(type)).toBe(true);
  es.emit("stage:start", { stageId: "a" });
  expect(got).toEqual([["stage:start", { stageId: "a" }]]);
  off();
  expect(es.closed).toBe(true);
});
