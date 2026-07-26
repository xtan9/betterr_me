import { expect, test } from '@playwright/test';

const email = `financial-safety-${Date.now()}@example.test`;
const password = 'Synthetic-Financial-Safety-Password-1';

test.describe('Financial Safety Cushion local production smoke', () => {
  test('a synthetic user can log in, save a draft, and resume it after reload', async ({ page }) => {
    await page.goto('/auth/sign-up');
    await page.getByLabel(/email/i).fill(email);
    await page.getByLabel(/^password$/i).fill(password);
    await page.getByLabel(/repeat password/i).fill(password);
    await page.getByRole('button', { name: /sign up|create account/i }).click();
    await page.waitForURL('/auth/sign-up-success');

    await page.goto('/auth/login');
    await page.getByLabel(/email/i).fill(email);
    await page.getByLabel(/^password$/i).fill(password);
    await page.getByRole('button', { name: /login/i }).click();
    await page.waitForURL('/dashboard');

    await page.goto('/money/safety-cushion');
    await page.getByLabel('Accessible cash').fill('2400.00');
    await page.getByLabel('Essential monthly costs').fill('1200.00');
    await page.getByLabel('My monthly income').fill('3500.00');
    await page.getByRole('button', { name: /save and continue/i }).click();
    await expect(page.getByText('Saved. You can return any time to continue.')).toBeVisible();

    await page.reload();
    await expect(page.getByText('Resume your saved check-up.')).toBeVisible();
    await expect(page.getByLabel('Accessible cash')).toHaveValue('2400.00');
    await expect(page.getByLabel('Essential monthly costs')).toHaveValue('1200.00');
    await expect(page.getByLabel('My monthly income')).toHaveValue('3500.00');
  });
});
