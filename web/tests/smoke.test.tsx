import "../test-setup";
import { afterEach, expect, test } from "bun:test";
import { render, waitFor, within } from "@testing-library/react";
import App from "../src/App";

const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
});

class FakeEventSource {
  addEventListener() {}
  close() {}
  constructor(public url: string) {}
}

test("前端 package scripts 提供 build 與 e2e", async () => {
  const pkg = await Bun.file(new URL("../package.json", import.meta.url)).json();
  expect(pkg.scripts.build).toContain("vite build");
  expect(pkg.scripts.e2e).toContain("playwright test");
});

test("App 渲染大廳", async () => {
  (globalThis as { EventSource?: typeof FakeEventSource }).EventSource = FakeEventSource;
  globalThis.fetch = (async () => new Response(JSON.stringify({ success: true, data: [] }), { status: 200 })) as typeof fetch;
  const view = render(<App />);
  const root = within(view.container);
  await waitFor(() => expect(root.getByText("勇者公會大廳")).toBeDefined());
});
