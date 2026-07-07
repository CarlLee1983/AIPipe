import { test, expect } from "bun:test";
import { Database } from "bun:sqlite";

test("bun runtime, sqlite, zod, yaml 都可用", async () => {
  const { z } = await import("zod");
  const YAML = await import("yaml");
  const db = new Database(":memory:", { strict: true });
  const row = db.query("SELECT 1 AS one").get() as { one: number };

  expect(row.one).toBe(1);
  expect(z.string().parse("hi")).toBe("hi");
  expect(YAML.parse("a: 1")).toEqual({ a: 1 });
});
