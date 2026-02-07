import { test, expect } from '@playwright/test';
import { ensureAuthenticated } from './helpers/auth';

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

test.describe('Complete Habit Flow', () => {
  test.beforeEach(async ({ page }) => {
    await ensureAuthenticated(page);
  });

  test('should toggle a habit as complete from dashboard', async ({ page }) => {
    await page.goto('/dashboard');
    await page.waitForLoadState('networkidle');

    // Use a stable selector (no state filter) so it stays valid after toggle
    const checkbox = page.locator('[role="checkbox"], input[type="checkbox"]').first();
    await expect(checkbox).toBeVisible({ timeout: 10000 });

    const wasChecked = await checkbox.isChecked();

    // Toggle the habit
    await checkbox.click();

    // Optimistic UI update: checkbox state should flip
    if (wasChecked) {
      await expect(checkbox).not.toBeChecked({ timeout: 5000 });
    } else {
      await expect(checkbox).toBeChecked({ timeout: 5000 });
    }
  });

  test('should toggle a habit as complete from habits page', async ({ page }) => {
    await page.goto('/habits');

    const checkbox = page.locator('[role="checkbox"], input[type="checkbox"]').first();
    await expect(checkbox).toBeVisible({ timeout: 10000 });

    const wasChecked = await checkbox.isChecked();

    // Toggle the habit
    await checkbox.click();

    // Should toggle state
    if (wasChecked) {
      await expect(checkbox).not.toBeChecked({ timeout: 5000 });
    } else {
      await expect(checkbox).toBeChecked({ timeout: 5000 });
    }
  });

  test('should persist habit completion after page refresh', async ({ page }) => {
    await page.goto('/dashboard');
    await page.waitForLoadState('networkidle');

    const checkbox = page.locator('[role="checkbox"], input[type="checkbox"]').first();
    await expect(checkbox).toBeVisible({ timeout: 10000 });

    const wasChecked = await checkbox.isChecked();

    // Toggle the habit
    await checkbox.click();
    if (wasChecked) {
      await expect(checkbox).not.toBeChecked({ timeout: 5000 });
    } else {
      await expect(checkbox).toBeChecked({ timeout: 5000 });
    }

    // Wait for API call to complete
    await page.waitForLoadState('networkidle');

    // Refresh the page
    await page.reload();

    // Wait for content to reload
    await page.waitForSelector('[role="checkbox"], input[type="checkbox"]', { timeout: 10000 });

    // The first checkbox should have the toggled state
    const refreshedCheckbox = page.locator('[role="checkbox"], input[type="checkbox"]').first();
    if (wasChecked) {
      await expect(refreshedCheckbox).not.toBeChecked({ timeout: 5000 });
    } else {
      await expect(refreshedCheckbox).toBeChecked({ timeout: 5000 });
    }
  });

  test('should uncomplete a previously completed habit', async ({ page }) => {
    await page.goto('/dashboard');
    await page.waitForLoadState('networkidle');

    // Find a checked habit using a stable selector
    const allCheckboxes = page.locator('[role="checkbox"], input[type="checkbox"]');
    const count = await allCheckboxes.count();

    let targetIndex = -1;
    for (let i = 0; i < count; i++) {
      if (await allCheckboxes.nth(i).isChecked()) {
        targetIndex = i;
        break;
      }
    }

    // Skip if no completed habits exist
    test.skip(targetIndex === -1, 'No completed habits to uncomplete');

    const checkedBox = allCheckboxes.nth(targetIndex);

    // Uncomplete it
    await checkedBox.click();

    // Should become unchecked
    await expect(checkedBox).not.toBeChecked({ timeout: 5000 });
  });

  test('should update streak display after completing a habit', async ({ page }) => {
    await page.goto('/habits');
    await page.waitForLoadState('networkidle');

    // Use a stable selector
    const checkbox = page.locator('[role="checkbox"], input[type="checkbox"]').first();
    await expect(checkbox).toBeVisible({ timeout: 10000 });

    const wasChecked = await checkbox.isChecked();

    // Complete the habit
    await checkbox.click();
    if (wasChecked) {
      await expect(checkbox).not.toBeChecked({ timeout: 5000 });
    } else {
      await expect(checkbox).toBeChecked({ timeout: 5000 });
    }

    // Wait for streak to update (API response)
    await page.waitForLoadState('networkidle');

    // Streak display should exist somewhere on the page
    const streakText = page.getByText(/streak|day/i).first();
    await expect(streakText).toBeVisible({ timeout: 5000 });
  });

  test('should navigate to habit detail page by clicking a habit', async ({ page }) => {
    await page.goto('/habits');
    await page.waitForLoadState('networkidle');

    // Click on a habit card name (not the checkbox) — HabitCard renders
    // the name as a <button> that triggers onClick(habitId) → router.push
    const habitName = page.locator('[class*="Card"] button, [class*="card"] button').first();
    await expect(habitName).toBeVisible({ timeout: 10000 });
    await habitName.click();

    // Should navigate to habit detail page
    await expect(page).toHaveURL(/\/habits\/[\w-]+/, { timeout: 10000 });
  });

  test('should show completion progress on dashboard', async ({ page }) => {
    await page.goto('/dashboard');
    await page.waitForLoadState('networkidle');

    // Look for completion text like "X of Y completed" or "X/Y"
    const completionText = page.getByText(/\d+\s*(of|\/)\s*\d+/i).first();
    await expect(completionText).toBeVisible({ timeout: 10000 });
  });

  test('should handle rapid toggling gracefully', async ({ page }) => {
    await page.goto('/dashboard');
    await page.waitForLoadState('networkidle');

    const checkbox = page.locator('[role="checkbox"], input[type="checkbox"]').first();
    await expect(checkbox).toBeVisible({ timeout: 10000 });

    const initialState = await checkbox.isChecked();

    // First toggle
    await checkbox.click();

    // Wait for the first toggle to take effect before clicking again
    if (initialState) {
      await expect(checkbox).not.toBeChecked({ timeout: 5000 });
    } else {
      await expect(checkbox).toBeChecked({ timeout: 5000 });
    }

    // Second toggle (back to original)
    await checkbox.click();

    // Wait for API calls to settle
    await page.waitForLoadState('networkidle');

    // Should return to initial state after double toggle
    if (initialState) {
      await expect(checkbox).toBeChecked({ timeout: 5000 });
    } else {
      await expect(checkbox).not.toBeChecked({ timeout: 5000 });
    }
  });
});
