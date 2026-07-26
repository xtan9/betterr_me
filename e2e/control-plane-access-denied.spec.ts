import { expect, test } from "@playwright/test";

test("an authenticated non-member receives the controlled Control Plane denial", async ({ page }) => {
  const response = await page.goto("/control-plane");

  expect(response?.status()).toBe(403);
  await expect(page.getByRole("heading", { name: "You don't have access to this page" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Return to dashboard" })).toHaveAttribute("href", "/dashboard");
  await expect(page.getByText(/membership|control plane/i)).not.toBeVisible();
});
