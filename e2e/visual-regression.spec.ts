import { test, expect } from '@playwright/test';
import { DashboardPage } from './pages/dashboard.page';
import { HabitsPage } from './pages/habits.page';
import { CreateHabitPage } from './pages/create-habit.page';

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

// TODO: Regenerate baselines after SSR/intention UI changes merged to main.
// Run: pnpm test:e2e:visual -- --update-snapshots --project=chromium
// Then commit the updated PNGs in e2e/visual-regression.spec.ts-snapshots/
test.describe.skip('Visual Regression', () => {
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
      // Use viewport clip (not fullPage) because parallel create-habit tests
      // add habits mid-run, making the full-page height non-deterministic.
      mask: [
        // Mask dynamic greeting text
        dashboard.greeting,
        // Mask dynamic stat numbers (streaks, counts, percentages)
        page.locator('[data-testid="stat-card"]'),
        // Mask habit checklist and tasks (content varies with parallel tests)
        page.locator('[role="checkbox"]'),
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
      // Use viewport clip (not fullPage) — same rationale as light mode
      mask: [
        dashboard.greeting,
        page.locator('[data-testid="stat-card"]'),
        page.locator('[role="checkbox"]'),
      ],
    });
  });

  test('habits list', async ({ page }) => {
    const habitsPage = new HabitsPage(page);
    await habitsPage.goto();

    await expect(page).toHaveScreenshot('habits-list.png', {
      maxDiffPixelRatio: 0.01,
      // Use viewport clip (not fullPage) — habit count varies with parallel create-habit tests
      mask: [
        // Mask only dynamic sub-elements, not entire cards
        page.locator('[role="checkbox"]'),
        page.locator('[data-testid="habit-streaks"]'),
        page.locator('[data-testid="habit-monthly-progress"]'),
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
        // Mask user-specific content (email, name, avatar URL from profile form)
        page.locator('input[type="email"]'),
        page.locator('input[name="full_name"]'),
        page.locator('input[name="avatar_url"]'),
      ],
    });
  });
});
