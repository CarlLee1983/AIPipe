import { expect, test } from "bun:test";

test("前端 package scripts 提供 build 與 e2e", async () => {
  const pkg = await Bun.file(new URL("../package.json", import.meta.url)).json();
  expect(pkg.scripts.build).toContain("vite build");
  expect(pkg.scripts.e2e).toContain("playwright test");
});
