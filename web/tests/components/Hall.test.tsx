import "../../test-setup";
import { afterEach, expect, test } from "bun:test";
import { fireEvent, render, waitFor, within } from "@testing-library/react";
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

function stubFetch() {
  (globalThis as { EventSource?: typeof FakeEventSource }).EventSource = FakeEventSource;
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes("/workflows")) return new Response(JSON.stringify({ success: true, data: [] }), { status: 200 });
    if (url.includes("/runs")) return new Response(JSON.stringify({ success: true, data: [] }), { status: 200 });
    return new Response(JSON.stringify({ success: true, data: null }), { status: 200 });
  }) as typeof fetch;
}

test("大廳預設只見場景與指令列，不直接顯示任務佈告欄", async () => {
  stubFetch();
  const view = render(<Hall />);
  const root = within(view.container);
  await waitFor(() => expect(root.getByText("勇者公會大廳")).toBeDefined());
  expect(root.getByAltText("NPC 公會主")).toBeDefined();
  expect(root.getByAltText("玩家角色")).toBeDefined();
  expect(root.getByRole("button", { name: "任務板" })).toBeDefined();
  expect(root.queryByText("任務佈告欄")).toBeNull();
});

test("點『任務板』開任務佈告欄視窗，關閉後消失", async () => {
  stubFetch();
  const view = render(<Hall />);
  const root = within(view.container);
  await waitFor(() => expect(root.getByRole("button", { name: "任務板" })).toBeDefined());
  fireEvent.click(root.getByRole("button", { name: "任務板" }));
  expect(root.getByText("任務佈告欄")).toBeDefined();
  fireEvent.click(root.getByLabelText("關閉"));
  expect(root.queryByText("任務佈告欄")).toBeNull();
});

test("點『發任務』開發佈新任務視窗", async () => {
  stubFetch();
  const view = render(<Hall />);
  const root = within(view.container);
  await waitFor(() => expect(root.getByRole("button", { name: "發任務" })).toBeDefined());
  fireEvent.click(root.getByRole("button", { name: "發任務" }));
  expect(root.getByText("發佈新任務")).toBeDefined();
});
