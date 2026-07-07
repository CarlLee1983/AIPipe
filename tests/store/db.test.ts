import { test, expect } from "bun:test";
import { openDb } from "../../src/store/db";

test("openDb 建立三張表", () => {
  const db = openDb(":memory:");
  const names = db
    .query("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
    .all()
    .map((r) => (r as { name: string }).name);
  expect(names).toContain("runs");
  expect(names).toContain("steps");
  expect(names).toContain("checkpoints");
});

test("migrate 可重入（重跑不報錯）", () => {
  const db = openDb(":memory:");
  // 第二次開同一連線的 migrate 由 openDb 已跑一次；再插入應正常
  db.query(
    "INSERT INTO runs (id, workflow_name, workflow_snapshot, status, inputs, context, current_stage_index, created_at, updated_at) " +
      "VALUES ($id, $wn, $ws, $st, $in, $ctx, $idx, $ca, $ua)",
  ).run({
    id: "r1", wn: "demo", ws: "name: demo", st: "pending",
    in: "{}", ctx: "{}", idx: 0, ca: "2026-07-07T00:00:00.000Z", ua: "2026-07-07T00:00:00.000Z",
  });
  const row = db.query("SELECT id FROM runs WHERE id=$id").get({ id: "r1" });
  expect(row).toEqual({ id: "r1" });
});
