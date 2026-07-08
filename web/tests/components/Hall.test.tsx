import "../../test-setup";
import { afterEach, expect, test } from "bun:test";
import { render, waitFor, within } from "@testing-library/react";
import { Hall } from "../../src/components/Hall";

const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
});

class FakeEventSource {
  addEventListener() {}
  close() {}
  constructor(public url: string) {}
}

test("Hall 載入後顯示任務佈告欄、NPC 與 SVG 路人", async () => {
  (globalThis as { EventSource?: typeof FakeEventSource }).EventSource = FakeEventSource;
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes("/workflows")) return new Response(JSON.stringify({ success: true, data: [] }), { status: 200 });
    if (url.includes("/runs")) return new Response(JSON.stringify({ success: true, data: [] }), { status: 200 });
    return new Response(JSON.stringify({ success: true, data: null }), { status: 200 });
  }) as typeof fetch;

  const view = render(<Hall />);
  const root = within(view.container);
  await waitFor(() => expect(root.getByText("任務佈告欄")).toBeDefined());
  expect(root.getByAltText("NPC 公會主")).toBeDefined();
  expect(root.getByAltText("玩家角色")).toBeDefined();
  expect(root.getByAltText("冒險者 A")).toBeDefined();
  expect(root.getByText("Lv.12")).toBeDefined();
});
