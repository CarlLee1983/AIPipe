import { expect, test } from "@playwright/test";

test("發任務、命中檢查點、核可後完成", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByText("勇者公會大廳")).toBeVisible();

  await page.getByRole("combobox").selectOption("e2e-demo");
  await page.getByLabel("topic").fill("Bun 入門");
  await page.getByRole("button", { name: "發佈任務" }).click();

  await expect(page.getByText("資料看起來 OK 嗎？")).toBeVisible({ timeout: 15_000 });
  await page.getByRole("button", { name: "▶ 核可" }).click();
  await expect(page.getByText("任務完成，做得好，勇者！")).toBeVisible({ timeout: 15_000 });
});
