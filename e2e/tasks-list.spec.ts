import { test, expect } from '@playwright/test';

test.describe('Tasks List Page', () => {
  test('should load tasks page and show heading', async ({ page }) => {
    await page.goto('/tasks');
    await page.waitForLoadState('networkidle');

    // Page main content should appear
    await expect(page.locator('main')).toBeVisible({ timeout: 10000 });

    // Should show the page title
    await expect(page.getByRole('heading', { name: /my tasks/i })).toBeVisible({ timeout: 10000 });

    // Should show the Create Task button
    await expect(page.getByRole('button', { name: /create task/i })).toBeVisible();
  });

  test('should show tabs for pending and completed', async ({ page }) => {
    await page.goto('/tasks');
    await page.waitForLoadState('networkidle');

    await expect(page.locator('main')).toBeVisible({ timeout: 10000 });

    // Should show Pending and Completed tabs
    await expect(page.getByText(/pending/i).first()).toBeVisible({ timeout: 10000 });
    await expect(page.getByText(/completed/i).first()).toBeVisible();
  });

  test('should navigate to create task page', async ({ page }) => {
    await page.goto('/tasks');
    await page.waitForLoadState('networkidle');

    await expect(page.locator('main')).toBeVisible({ timeout: 10000 });

    const createButton = page.getByRole('button', { name: /create task/i });
    await expect(createButton).toBeVisible({ timeout: 10000 });
    await createButton.click();

    await expect(page).toHaveURL(/\/tasks\/new/, { timeout: 10000 });
  });

  test('should show tasks nav item in navigation', async ({ page }) => {
    await page.goto('/tasks');
    await page.waitForLoadState('networkidle');

    // Desktop nav should show Tasks link (hidden on mobile, visible on desktop)
    const tasksNavLink = page.locator('nav a[href="/tasks"]').first();
    await expect(tasksNavLink).toBeAttached({ timeout: 10000 });
  });
});
