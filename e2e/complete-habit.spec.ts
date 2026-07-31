import { test, expect, type Page } from '@playwright/test';
import { DashboardPage } from './pages/dashboard.page';
import { HabitsPage } from './pages/habits.page';
import { toggleAndVerify } from './helpers/checkbox';
import { E2E_READ_ONLY, SEED_HABIT_NAMES } from './constants';

/**
 * QA-002: E2E test - Complete habit flow
 * Tests habit completion/toggle and persistence.
 *
 * Acceptance criteria:
 * - Test passes in CI
 * - Tests optimistic UI updates
 * - Tests persistence after refresh
 * - Runs in <30 seconds
 */

const TARGET_HABIT = SEED_HABIT_NAMES[0];

function targetCheckbox(page: Page) {
  return page.locator(`[role="checkbox"][aria-label*="${TARGET_HABIT}"]`);
}

test.describe('Complete Habit Flow - Toggle', () => {
  test.skip(E2E_READ_ONLY, 'Habit mutation requires disposable E2E state');
  test.describe.configure({ mode: 'serial' });

  test('should toggle a habit as complete from habits page', async ({ page }) => {
    const habits = new HabitsPage(page);
    await habits.goto();

    const checkbox = targetCheckbox(page);
    await expect(checkbox).toBeVisible({ timeout: 10000 });
    await toggleAndVerify(checkbox);
  });

  test('should persist habit completion after page refresh', async ({ page }) => {
    const dashboard = new DashboardPage(page);
    await dashboard.goto();

    const checkbox = targetCheckbox(page);
    await expect(checkbox).toBeVisible({ timeout: 10000 });
    const toggleFinished = page.waitForResponse((response) => {
      const request = response.request();
      return request.method() === 'POST' && new URL(response.url()).pathname.endsWith('/toggle');
    });
    const wasChecked = await toggleAndVerify(checkbox);
    await toggleFinished;

    const toggledState = wasChecked ? 'unchecked' : 'checked';
    await expect(checkbox).toHaveAttribute('data-state', toggledState, { timeout: 10000 });

    await page.reload();
    await page.waitForSelector('[role="checkbox"]', { timeout: 10000 });

    const refreshedCheckbox = targetCheckbox(page);
    const expectedState = wasChecked ? 'unchecked' : 'checked';
    await expect(refreshedCheckbox).toHaveAttribute('data-state', expectedState, { timeout: 5000 });
  });
});

test.describe('Complete Habit Flow - Read', () => {
  test.skip(E2E_READ_ONLY, 'Run-owned habit reads require disposable E2E state');

  test('should navigate to habit detail page by clicking a habit', async ({ page }) => {
    const habits = new HabitsPage(page);
    await habits.goto();

    const habitCard = habits.habitCards.first();
    await expect(habitCard).toBeVisible({ timeout: 10000 });
    await habitCard.locator('button[type="button"]').first().click();
    await expect(page).toHaveURL(/\/habits\/[\w-]+/, { timeout: 10000 });
  });
});
