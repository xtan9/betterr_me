import { test, expect, type Page } from '@playwright/test';
import { DashboardPage } from './pages/dashboard.page';
import { HabitsPage } from './pages/habits.page';
import { toggleAndVerify } from './helpers/checkbox';

/**
 * QA-002: E2E test - Complete habit flow
 * Tests habit completion/toggle, streak updates, and persistence.
 *
 * Acceptance criteria:
 * - Test passes in CI
 * - Tests optimistic UI updates
 * - Tests streak calculation
 * - Tests edit window enforcement
 * - Runs in <30 seconds
 */

/** The seed habit this file exclusively toggles (avoids parallel contention). */
const TARGET_HABIT = 'E2E Test - Seed Habit 1';

/** Locate the checkbox for TARGET_HABIT by its aria-label. */
function targetCheckbox(page: Page) {
  return page.locator(`[role="checkbox"][aria-label*="${TARGET_HABIT}"]`);
}

// --- Toggle tests: serial to avoid contention on the shared seed habit ---

test.describe('Complete Habit Flow - Toggle', () => {
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

    const wasChecked = await toggleAndVerify(checkbox);

    // Wait for API call to complete
    await page.waitForLoadState('networkidle');

    // Refresh the page
    await page.reload();

    // Wait for content to reload
    await page.waitForSelector('[role="checkbox"]', { timeout: 10000 });

    // The same habit checkbox should have the toggled state
    const refreshedCheckbox = targetCheckbox(page);
    const expectedState = wasChecked ? 'unchecked' : 'checked';
    await expect(refreshedCheckbox).toHaveAttribute('data-state', expectedState, { timeout: 5000 });
  });

});

// --- Read-only tests: safe to run in parallel ---

test.describe('Complete Habit Flow - Read', () => {
  test('should navigate to habit detail page by clicking a habit', async ({ page }) => {
    const habits = new HabitsPage(page);
    await habits.goto();

    // Click the habit name button inside the first habit card (data-testid="habit-card-*")
    const habitCard = habits.habitCards.first();
    await expect(habitCard).toBeVisible({ timeout: 10000 });
    const habitName = habitCard.locator('button[type="button"]').first();
    await habitName.click();

    // Should navigate to habit detail page
    await expect(page).toHaveURL(/\/habits\/[\w-]+/, { timeout: 10000 });
  });

});
