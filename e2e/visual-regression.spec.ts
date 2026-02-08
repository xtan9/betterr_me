import { test, expect } from '@playwright/test';
import { DashboardPage } from './pages/dashboard.page';
import { HabitsPage } from './pages/habits.page';
import { CreateHabitPage } from './pages/create-habit.page';
import { LoginPage } from './pages/login.page';

/**
 * Visual regression tests — screenshot comparison for key pages.
 *
 * Run with: pnpm test:e2e:visual
 * Update baselines: pnpm test:e2e:visual -- --update-snapshots
 *
 * Baselines are platform-dependent. Always generate from the same OS used in CI.
 * Dynamic content (greeting text, dates, streak counts) is masked to prevent
 * false positives.
 */

test.describe('Visual Regression', () => {
  test('login page', async ({ page }) => {
    // Use unauthenticated context for login page
    await page.context().clearCookies();
    await page.goto('/auth/login');
    await page.waitForLoadState('networkidle');

    await expect(page).toHaveScreenshot('login-page.png', {
      maxDiffPixelRatio: 0.01,
      fullPage: true,
    });
  });

  test('dashboard - light mode', async ({ page }) => {
    const dashboard = new DashboardPage(page);
    await dashboard.goto();

    // Ensure light mode
    await page.evaluate(() => {
      document.documentElement.classList.remove('dark');
      document.documentElement.classList.add('light');
      document.documentElement.style.colorScheme = 'light';
    });
    // Allow theme to settle
    await page.waitForTimeout(500);

    await expect(page).toHaveScreenshot('dashboard-light.png', {
      maxDiffPixelRatio: 0.01,
      fullPage: true,
      mask: [
        // Mask dynamic greeting text
        dashboard.greeting,
        // Mask dynamic stat numbers (streaks, counts, percentages)
        page.locator('[class*="rounded-xl"][class*="border"]'),
      ],
    });
  });

  test('dashboard - dark mode', async ({ page }) => {
    const dashboard = new DashboardPage(page);
    await dashboard.goto();

    // Switch to dark mode
    await page.evaluate(() => {
      document.documentElement.classList.remove('light');
      document.documentElement.classList.add('dark');
      document.documentElement.style.colorScheme = 'dark';
    });
    await page.waitForTimeout(500);

    await expect(page).toHaveScreenshot('dashboard-dark.png', {
      maxDiffPixelRatio: 0.01,
      fullPage: true,
      mask: [
        dashboard.greeting,
        page.locator('[class*="rounded-xl"][class*="border"]'),
      ],
    });
  });

  test('habits list', async ({ page }) => {
    const habitsPage = new HabitsPage(page);
    await habitsPage.goto();

    await expect(page).toHaveScreenshot('habits-list.png', {
      maxDiffPixelRatio: 0.01,
      fullPage: true,
      mask: [
        // Mask checkbox states and streak counts which change between runs
        page.locator('[role="checkbox"]'),
        page.locator('[data-testid^="habit-card"]'),
      ],
    });
  });

  test('create habit form', async ({ page }) => {
    const createPage = new CreateHabitPage(page);
    await createPage.goto();

    await expect(page).toHaveScreenshot('create-habit-form.png', {
      maxDiffPixelRatio: 0.01,
      fullPage: true,
    });
  });

  test('settings page', async ({ page }) => {
    await page.goto('/dashboard/settings');
    await page.waitForLoadState('networkidle');

    await expect(page).toHaveScreenshot('settings-page.png', {
      maxDiffPixelRatio: 0.01,
      fullPage: true,
      mask: [
        // Mask user-specific content (email, name)
        page.locator('input[type="email"]'),
        page.locator('input[name="name"], input[name="display_name"]'),
      ],
    });
  });
});
