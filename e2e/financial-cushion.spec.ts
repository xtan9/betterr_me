import { expect, test } from "@playwright/test";

test.beforeEach(async ({ page }, testInfo) => {
  test.skip(
    !testInfo.project.name.startsWith("runway-public"),
    "Anonymous runway has dedicated projects",
  );
  await page.addInitScript(() => window.localStorage.clear());
});

test("completes the anonymous adaptive interview and previews What-if without changing the baseline", async (
  { page },
  testInfo,
) => {
  await page.goto("/finance/cushion?campaign=e2e&video=runway&cta=test");
  await expect(
    page.getByRole("heading", {
      name: "How much time would your household have if income stopped?",
    }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Start my check-up" }).click();

  await page
    .getByRole("textbox", { name: "State, province, or region" })
    .fill("California");
  await page.getByRole("button", { name: "Continue" }).click();
  await page
    .getByRole("button", { name: /I share household finances/ })
    .click();
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByRole("button", { name: "Continue" }).click();

  await page.getByRole("button", { name: "I know take-home pay" }).click();
  await page
    .getByRole("combobox", { name: "Pay period" })
    .selectOption("monthly");
  await page.getByRole("spinbutton", { name: "Income amount" }).fill("5000");
  await page.getByRole("button", { name: "Continue" }).click();

  await page.getByRole("button", { name: "I know take-home pay" }).click();
  await page
    .getByRole("combobox", { name: "Pay period" })
    .selectOption("monthly");
  await page.getByRole("spinbutton", { name: "Income amount" }).fill("4000");
  await page.getByRole("button", { name: "Continue" }).click();

  await page.getByRole("button", { name: "Skip for now" }).click();
  await page
    .getByRole("spinbutton", { name: "Cash available now" })
    .fill("30000");
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByRole("button", { name: "Skip for now" }).click();
  await page.getByRole("button", { name: "Skip for now" }).click();

  await page
    .getByRole("spinbutton", { name: "Current total monthly spending" })
    .fill("6000");
  await page
    .getByRole("spinbutton", { name: "Lowest realistic monthly spending" })
    .fill("6000");
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByRole("button", { name: "Skip for now" }).click();

  await expect(page.getByText("Skipped", { exact: true })).toHaveCount(5);
  await page.getByRole("button", { name: "Show my runway" }).click();

  await expect(page.getByRole("tab", { name: "My income stops" })).toBeVisible();
  await expect(
    page.getByRole("tab", { name: "Partner income stops" }),
  ).toBeVisible();
  await expect(page.getByRole("tab", { name: "Both incomes stop" })).toBeVisible();
  await expect(page.getByRole("heading", { level: 1 })).toContainText(
    "15.0 months",
  );

  await page.getByRole("tab", { name: "Both incomes stop" }).click();
  await expect(page.getByRole("heading", { level: 1 })).toContainText(
    "5.0 months",
  );
  await page
    .getByRole("spinbutton", { name: "Add accessible cash" })
    .fill("6000");
  await expect(page.getByText("+1.0 months", { exact: true })).toBeVisible();

  await page.getByRole("button", { name: "Reset" }).click();
  await expect(page.getByRole("heading", { level: 1 })).toContainText(
    "5.0 months",
  );
  await expect(
    page.getByRole("link", { name: "Create account to save" }),
  ).toHaveAttribute("href", "/auth/sign-up?next=/finance/cushion");

  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(1);

  const evidenceName = testInfo.project.name.endsWith("mobile")
    ? "household-runway-mobile-390.png"
    : "household-runway-desktop.png";
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({
    path: `${process.cwd()}/docs/screenshots/${evidenceName}`,
    animations: "disabled",
  });
});
