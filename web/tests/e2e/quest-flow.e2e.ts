import { expect, test } from "@playwright/test";

test("發任務、命中檢查點、核可後完成", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByText("AI 勇者大廳")).toBeVisible();

  await page.getByText("e2e-demo").waitFor();
  await page
    .locator(".quest-card")
    .filter({ hasText: "e2e-demo" })
    .getByRole("button", { name: "⚔️ 接取委託 (Accept Quest)" })
    .click();
  await page.getByLabel("topic * (必填)").fill("Bun 入門");
  await page.getByRole("button", { name: /簽署委託並出發/ }).click();

  await expect(page.locator(".review-prompt-text", { hasText: "資料看起來 OK 嗎？" })).toBeVisible({
    timeout: 15_000,
  });
  await page.getByRole("button", { name: /授權通過並繼續/ }).click();
  await expect(page.getByText("冒險完成 (Completed)")).toBeVisible({ timeout: 15_000 });
});
