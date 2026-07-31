import { expect, test } from '@playwright/test';
import { E2E_READ_ONLY, SEED_HABIT_NAMES } from './constants';
import { habitCheckbox, toggleAndVerify } from './helpers/checkbox';

test.describe('Cross-browser compatibility smoke', () => {
  test.skip(E2E_READ_ONLY, 'The scheduled smoke contract requires disposable run-owned state');

  test('starts an authenticated session, navigates, and updates a run-owned habit', async ({ page }) => {
    await page.goto('/dashboard');
    await expect(page.locator('main')).toBeVisible();
    await expect(page).toHaveURL('/dashboard');

    if (test.info().project.use.isMobile) {
      await page.getByRole('button', { name: 'Toggle Sidebar' }).click();
    }
    const habitsLink = page.getByRole('link', { name: /habit/i }).first();
    await expect(habitsLink).toBeVisible();
    await habitsLink.click();
    await expect(page).toHaveURL(/\/habits(?:\?|$)/);

    const checkbox = habitCheckbox(page, SEED_HABIT_NAMES[0]);
    await expect(checkbox).toBeVisible({ timeout: 30_000 });
    await toggleAndVerify(checkbox);
  });
});
