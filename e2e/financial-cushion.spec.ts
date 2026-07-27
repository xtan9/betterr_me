import { expect, test } from "@playwright/test";

test.beforeEach(async ({ context }, testInfo) => {
  test.skip(
    !testInfo.project.name.startsWith("runway-public"),
    "Anonymous runway has dedicated projects",
  );
  await context.clearCookies();
});

test("starts anonymous visitors on the landing page and preserves attribution through browser Back", async ({ page }, testInfo) => {
  await page.goto("/finance/cushion?campaign=e2e&video=runway&cta=test");

  await expect(page.getByRole("heading", { name: "How long could your household keep going?" })).toBeVisible();
  await expect(page.getByText("$30,000 accessible ÷ $6,000 essential costs")).toBeVisible();
  await expect(page.getByRole("button", { name: "Language" })).toContainText("English");

  const landingEvidence = testInfo.project.name.endsWith("mobile")
    ? "household-runway-landing-mobile-390.png"
    : "household-runway-landing-desktop.png";
  await page.screenshot({ path: `${process.cwd()}/docs/screenshots/${landingEvidence}`, fullPage: true, animations: "disabled" });

  await page.getByTestId("runway-hero-cta").click();
  await expect(page).toHaveURL(/campaign=e2e.*video=runway.*cta=test.*start=1/);
  await expect(page.getByRole("heading", { name: "Where does your household live?" })).toBeVisible();

  await page.goBack();
  await expect(page.getByRole("heading", { name: "How long could your household keep going?" })).toBeVisible();
  await expect(page).toHaveURL(/campaign=e2e.*video=runway.*cta=test/);
  await expect(page.getByTestId("runway-hero-cta")).toContainText("Resume my check-up");
});

test("completes the quick interview, edits take-home pay, and previews What-if without changing the baseline", async ({ page }, testInfo) => {
  await page.goto("/finance/cushion?campaign=e2e&video=runway&cta=test");
  await page.getByTestId("runway-hero-cta").click();

  await page.getByRole("combobox", { name: "State, province, or region" }).selectOption("CA");
  const locationContinueY = (await page.getByRole("button", { name: "Continue" }).boundingBox())?.y;
  await page.getByRole("button", { name: "Continue" }).click();
  const householdContinueY = (await page.getByRole("button", { name: "Continue" }).boundingBox())?.y;
  expect(Math.abs((locationContinueY ?? 0) - (householdContinueY ?? 0))).toBeLessThanOrEqual(2);
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByRole("button", { name: "Continue" }).click();

  await page.getByRole("textbox", { name: "Income amount" }).fill("120000");
  await page.getByRole("button", { name: "I know take-home pay" }).click();
  await page.getByRole("textbox", { name: "Income amount" }).fill("7000");
  await page.getByRole("button", { name: "I know gross pay" }).click();
  await expect(page.getByRole("textbox", { name: "Income amount" })).toHaveValue("120000");
  await page.getByRole("button", { name: "I know take-home pay" }).click();
  await expect(page.getByRole("textbox", { name: "Income amount" })).toHaveValue("7000");
  await page.getByRole("button", { name: "I know gross pay" }).click();
  await expect(page.getByText("How this estimate is calculated")).toBeVisible();
  await page.getByRole("button", { name: "Enter my actual take-home pay" }).click();
  await page.getByRole("textbox", { name: "Actual monthly take-home pay" }).fill("5000");
  await page.getByRole("button", { name: "Continue" }).click();

  await page.getByRole("button", { name: "Skip for now" }).click();
  await page.getByRole("textbox", { name: "Cash available now" }).fill("30000");
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByRole("button", { name: "Skip for now" }).click();

  await expect(page.getByRole("button", { name: /Housing/ })).toBeVisible();
  await page.getByRole("button", { name: "I already know my totals" }).click();
  await page.getByRole("textbox", { name: "Current total monthly spending" }).fill("6000");
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByRole("textbox", { name: "After interruption" }).fill("6000");
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByRole("button", { name: "Show my runway" }).click();

  await expect(page.getByRole("tab", { name: "My income stops" })).toBeVisible();
  await expect(page.getByRole("heading", { level: 1 })).toContainText("5.0 months");
  await expect(page.getByText("Month 0", { exact: true })).toBeVisible();
  await expect(page.getByText("Month 12", { exact: true })).toBeVisible();
  await page.getByRole("textbox", { name: "Add accessible cash" }).fill("6000");
  await expect(page.getByText("+1.0 months", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Reset" }).click();
  await expect(page.getByRole("heading", { level: 1 })).toContainText("5.0 months");
  await expect(page.getByRole("link", { name: "Create account to save" })).toHaveAttribute("href", "/auth/sign-up?next=/finance/cushion");

  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);

  const evidenceName = testInfo.project.name.endsWith("mobile")
    ? "household-runway-result-mobile-390.png"
    : "household-runway-result-desktop.png";
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: `${process.cwd()}/docs/screenshots/${evidenceName}`, animations: "disabled" });

  await page.goBack();
  await expect(page.getByTestId("runway-hero-cta")).toContainText("View my result");
  await page.getByTestId("runway-hero-cta").click();
  await expect(page.getByRole("heading", { level: 1 })).toContainText("5.0 months");
});

test("switches locale without losing the current step, attribution, or canonical region", async ({ page }) => {
  await page.goto("/finance/cushion?campaign=locale-test&cta=header");
  await page.getByTestId("runway-hero-cta").click();
  const region = page.getByRole("combobox", { name: "State, province, or region" });
  await page.getByRole("button", { name: "Canada" }).click();
  await expect(page.getByRole("combobox", { name: "Household currency" })).toHaveValue("CAD");
  await page.getByRole("button", { name: "United States" }).click();
  await expect(region).toHaveValue("");
  await expect(page.getByRole("combobox", { name: "Household currency" })).toHaveValue("USD");
  await region.selectOption("CA");
  await expect.poll(() =>
    page.evaluate(() => {
      const raw = window.localStorage.getItem("betterr.household-runway.v2");
      return raw ? JSON.parse(raw).answers.region : null;
    }),
  ).toBe("CA");

  await page.getByRole("button", { name: "Language" }).click();
  await page.getByRole("menuitem", { name: "简体中文" }).click();
  await expect(page.getByRole("heading", { name: "你的家庭住在哪里？" })).toBeVisible();
  await expect.poll(() =>
    page.evaluate(() => {
      const raw = window.localStorage.getItem("betterr.household-runway.v2");
      return raw ? JSON.parse(raw).answers.region : null;
    }),
  ).toBe("CA");
  await expect(page).toHaveURL(/campaign=locale-test.*cta=header.*start=1/);
  await expect(page.getByRole("combobox", { name: "州、省或地区" })).toHaveValue("CA");
  await expect(page.getByRole("button", { name: "Language" })).toContainText("简体中文");
});

test("uses guided income, asset, housing, and transportation cards", async ({ page }) => {
  await page.goto("/finance/cushion?campaign=guided-e2e&cta=cards");
  await page.getByTestId("runway-hero-cta").click();
  await page.getByRole("combobox", { name: "State, province, or region" }).selectOption("CA");
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByRole("button", { name: "Unemployed" }).click();
  await page.getByRole("button", { name: "Continue" }).click();

  const rental = page.getByRole("group", { name: "Net rental income" });
  await rental.getByRole("button", { name: "Yes" }).click();
  await rental.getByRole("textbox", { name: "Net rental income" }).fill("500");
  await expect(page.getByText("Dependable income total: $500/month")).toBeVisible();
  await page.getByRole("button", { name: "Continue" }).click();

  await page.getByRole("textbox", { name: "Cash available now" }).fill("0");
  await page.getByRole("button", { name: "Continue" }).click();

  const accessible = page.getByRole("group", { name: "Easy-to-withdraw investments" });
  await accessible.getByRole("button", { name: "Yes" }).click();
  await accessible.getByRole("textbox", { name: "Easy-to-withdraw investments" }).fill("6000");
  const deferred = page.getByRole("group", { name: "Tax-deferred or taxable-on-withdrawal retirement" });
  await deferred.getByRole("button", { name: "Yes" }).click();
  await deferred.getByRole("textbox", { name: "Tax-deferred or taxable-on-withdrawal retirement" }).fill("100000");
  await page.getByRole("button", { name: "Continue" }).click();

  await page.getByRole("button", { name: /Housing/ }).click();
  await page.getByText("Or itemize this category").click();
  await page.getByRole("button", { name: "Own" }).click();
  await expect(page.getByText(/Do not add them again if they are already included in escrow/)).toBeVisible();
  await page.getByRole("textbox", { name: "Mortgage" }).fill("3000");
  await page.getByRole("textbox", { name: "Property tax" }).fill("12000");
  await page.getByRole("combobox", { name: "Property tax · Frequency" }).selectOption("annual");
  await page.getByRole("button", { name: "Save category" }).focus();
  await page.keyboard.press("Enter");

  await page.getByRole("button", { name: /Transportation/ }).click();
  await page.getByText("Or itemize this category").click();
  await page.getByRole("textbox", { name: "Vehicle payment or lease" }).fill("500");
  await page.getByRole("textbox", { name: "Car insurance" }).fill("1200");
  await page.getByRole("textbox", { name: "Fuel or charging" }).fill("200");
  await page.getByRole("combobox", { name: "Car insurance · Frequency" }).selectOption("annual");
  await page.getByRole("button", { name: "Save category" }).focus();
  await page.keyboard.press("Enter");

  await expect(page.getByText("Current monthly total: $4,800")).toBeVisible();
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.getByRole("heading", { name: "What could realistically change?" })).toBeVisible();
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByRole("button", { name: "Show my runway" }).click();

  expect(await page.getByText("$6,000", { exact: true }).count()).toBeGreaterThanOrEqual(2);
  await expect(page.getByText("$100,000", { exact: true })).toBeVisible();
});
