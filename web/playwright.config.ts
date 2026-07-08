import { defineConfig } from "@playwright/test";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

const webDir = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  testDir: "./tests/e2e",
  testMatch: "**/*.e2e.ts",
  timeout: 30_000,
  use: { baseURL: "http://localhost:3100" },
  webServer: {
    command:
      "AIPIPE_MOCK=1 AIPIPE_PORT=3100 AIPIPE_DB=:memory: AIPIPE_STATIC=./dist AIPIPE_WORKFLOWS=../workflows bun run ../src/server/index.ts",
    url: "http://localhost:3100/api/workflows",
    reuseExistingServer: false,
    cwd: webDir,
  },
});
