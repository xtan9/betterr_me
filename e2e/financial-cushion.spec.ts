import { expect, test } from "@playwright/test";

test.describe("Financial Safety Cushion", () => {
  test("creates, saves, and reloads an authenticated cushion", async ({ page }) => {
    const response = await page.goto("/finance/cushion");
    console.log(
      `[cushion] navigation status=${response?.status() ?? "none"} url=${page.url()} headings=${JSON.stringify(
        await page.getByRole("heading").allTextContents(),
      )}`,
    );

    await expect(page).toHaveURL(/\/finance\/cushion\/?$/);

    await expect(
      page.getByRole("heading", { name: "Financial Safety Cushion" }),
    ).toBeVisible();

    await page
      .getByLabel("Immediately available liquid resources")
      .fill("12000");
    await page.getByLabel("Essential monthly expenses").fill("3000");
    await page
      .getByLabel("Monthly income that would continue")
      .fill("0");

    await page.getByRole("button", { name: "Save cushion" }).click();

    await expect(page.getByRole("status")).toHaveText("Your cushion is saved.");
    await expect(page.getByTestId("cushion-months")).toHaveText("4.00 months");
    await expect(
      page.getByTestId("cushion-result").getByText("3–6 months"),
    ).toBeVisible();

    await page.reload();

    await expect(page.getByTestId("cushion-months")).toHaveText("4.00 months");
    await expect(
      page.getByLabel("Immediately available liquid resources"),
    ).toHaveValue("12000.00");
    await expect(
      page.getByText("Planning tool, not financial advice"),
    ).toBeVisible();
  });
});
