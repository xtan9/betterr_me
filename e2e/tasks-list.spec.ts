import { test, expect } from '@playwright/test';

test.describe('Tasks List Page', () => {
  test('should navigate to create task page', async ({ page }) => {
    await page.goto('/tasks');
    await page.waitForLoadState('networkidle');

    await expect(page.locator('main')).toBeVisible({ timeout: 10000 });

    const createButton = page.getByRole('button', { name: /create task/i });
    await expect(createButton).toBeVisible({ timeout: 10000 });
    await createButton.click();

    await expect(page).toHaveURL(/\/tasks\/new/, { timeout: 10000 });
  });
});
