import { test, expect } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const rootDir = join(import.meta.dir, "..");
const webDir = join(rootDir, "web");

test("前端專案骨架與 Vite 配置存在且有效", () => {
  expect(existsSync(join(webDir, "package.json"))).toBe(true);
  expect(existsSync(join(webDir, "vite.config.ts"))).toBe(true);
  expect(existsSync(join(webDir, "tsconfig.json"))).toBe(true);
  expect(existsSync(join(webDir, "index.html"))).toBe(true);
  expect(existsSync(join(webDir, "src/main.tsx"))).toBe(true);
  expect(existsSync(join(webDir, "src/App.tsx"))).toBe(true);
  expect(existsSync(join(webDir, "src/App.css"))).toBe(true);

  const rootPkg = JSON.parse(readFileSync(join(rootDir, "package.json"), "utf-8"));
  expect(rootPkg.scripts["dev:server"]).toBe("bun run src/server/index.ts");
  expect(rootPkg.scripts["dev:web"]).toBe("cd web && bun run dev");
  expect(rootPkg.scripts["build:web"]).toBe("cd web && bun run build");
});
