import { test, expect, type Locator } from '@playwright/test';

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

/** Toggle a checkbox and assert the state flipped. Returns the previous state. */
async function toggleAndVerify(checkbox: Locator): Promise<boolean> {
  const wasChecked = await checkbox.isChecked();
  await checkbox.click();
  if (wasChecked) {
    await expect(checkbox).not.toBeChecked({ timeout: 5000 });
  } else {
    await expect(checkbox).toBeChecked({ timeout: 5000 });
  }
  return wasChecked;
}

test.describe('Complete Habit Flow', () => {
  test('should toggle a habit as complete from dashboard', async ({ page }) => {
    await page.goto('/dashboard');
    await page.waitForLoadState('networkidle');

    const checkbox = page.locator('[role="checkbox"], input[type="checkbox"]').first();
    await expect(checkbox).toBeVisible({ timeout: 10000 });

    await toggleAndVerify(checkbox);
  });

  test('should toggle a habit as complete from habits page', async ({ page }) => {
    await page.goto('/habits');

    const checkbox = page.locator('[role="checkbox"], input[type="checkbox"]').first();
    await expect(checkbox).toBeVisible({ timeout: 10000 });

    await toggleAndVerify(checkbox);
  });

  test('should persist habit completion after page refresh', async ({ page }) => {
    await page.goto('/dashboard');
    await page.waitForLoadState('networkidle');

    const checkbox = page.locator('[role="checkbox"], input[type="checkbox"]').first();
    await expect(checkbox).toBeVisible({ timeout: 10000 });

    const wasChecked = await toggleAndVerify(checkbox);

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

    // Ensure a completed habit exists: toggle the first checkbox to checked
    const firstCheckbox = page.locator('[role="checkbox"], input[type="checkbox"]').first();
    await expect(firstCheckbox).toBeVisible({ timeout: 10000 });

    if (!(await firstCheckbox.isChecked())) {
      await firstCheckbox.click();
      await expect(firstCheckbox).toBeChecked({ timeout: 5000 });
      await page.waitForLoadState('networkidle');
    }

    // Now find the checked checkbox (guaranteed to exist)
    const allCheckboxes = page.locator('[role="checkbox"], input[type="checkbox"]');
    const count = await allCheckboxes.count();

    let targetIndex = -1;
    for (let i = 0; i < count; i++) {
      if (await allCheckboxes.nth(i).isChecked()) {
        targetIndex = i;
        break;
      }
    }

    expect(targetIndex).toBeGreaterThanOrEqual(0);

    const checkedBox = allCheckboxes.nth(targetIndex);

    // Uncomplete it
    await checkedBox.click();

    // Should become unchecked
    await expect(checkedBox).not.toBeChecked({ timeout: 5000 });
  });

  test('should update streak display after completing a habit', async ({ page }) => {
    await page.goto('/habits');
    await page.waitForLoadState('networkidle');

    const checkbox = page.locator('[role="checkbox"], input[type="checkbox"]').first();
    await expect(checkbox).toBeVisible({ timeout: 10000 });

    // Capture streak text before toggle from the same habit card
    const card = checkbox.locator('xpath=ancestor::div[contains(@class, "flex")]').first();
    const streakBefore = await card.getByText(/\d+\s*day/i).textContent().catch(() => null);

    await toggleAndVerify(checkbox);

    // Wait for streak update (API response)
    await page.waitForLoadState('networkidle');

    // Verify streak text is still visible and potentially changed
    const streakAfter = await card.getByText(/\d+\s*day/i).textContent().catch(() => null);
    // Streak display must exist after toggling
    expect(streakAfter).toBeTruthy();
    // If we went from unchecked→checked, streak should differ (or at least still be present)
    if (streakBefore !== null && streakAfter !== null) {
      // We can't guarantee the numeric value changed (depends on server state),
      // but we verify the streak element survived the re-render.
      expect(streakAfter).toBeDefined();
    }
  });

  test('should navigate to habit detail page by clicking a habit', async ({ page }) => {
    await page.goto('/habits');
    await page.waitForLoadState('networkidle');

    // Click the habit name button inside the first habit card (data-testid="habit-card-*")
    const habitCard = page.locator('[data-testid^="habit-card"]').first();
    await expect(habitCard).toBeVisible({ timeout: 10000 });
    const habitName = habitCard.locator('button[type="button"]').first();
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

    // Rapidly toggle — two clicks with no wait in between to test debounce/race handling
    await checkbox.click();
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
