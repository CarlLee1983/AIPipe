import { test, expect, beforeAll, afterAll } from "bun:test";
import { mkdir, writeFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { WorkflowCatalog } from "../../src/server/workflows";

const tmpDir = join(import.meta.dir, ".tmp-workflows");

beforeAll(async () => {
  await mkdir(tmpDir, { recursive: true });
  await writeFile(join(tmpDir, "b.yaml"), "name: beta\ninputs: [{ name: x }]\nstages: [{ id: s1, agent: { prompt: p } }]\n");
  await writeFile(join(tmpDir, "a.yml"), "name: alpha\ninputs: []\nstages: [{ id: s1, agent: { prompt: p } }, { id: s2, agent: { prompt: p } }]\n");
  await writeFile(join(tmpDir, "bad.yaml"), "name: [invalid\n"); // 解析失敗應跳過
  await writeFile(join(tmpDir, "ignore.txt"), "not yaml");
});

afterAll(async () => {
  await rm(tmpDir, { recursive: true, force: true });
});

test("list 掃描 yaml/yml 並依 name 正序回傳，跳過壞檔", async () => {
  const catalog = new WorkflowCatalog(tmpDir);
  const list = await catalog.list();
  expect(list).toHaveLength(2);
  expect(list.map((w) => w.name)).toEqual(["alpha", "beta"]);
  expect(list[0].stageCount).toBe(2);
  expect(list[1].inputs).toEqual([{ name: "x", required: false }]);
});

test("get 依 name 取得 summary；找不到回 null", async () => {
  const catalog = new WorkflowCatalog(tmpDir);
  const alpha = await catalog.get("alpha");
  expect(alpha?.name).toBe("alpha");
  expect(alpha?.rawYaml).toContain("name: alpha");
  expect(await catalog.get("nope")).toBeNull();
});

test("目錄不存在回空陣列不擲錯", async () => {
  const catalog = new WorkflowCatalog(join(tmpDir, "non-existent"));
  expect(await catalog.list()).toEqual([]);
});
