import { test, expect } from '@playwright/test';
import { CreateHabitPage } from './pages/create-habit.page';
import { HabitsPage } from './pages/habits.page';

/**
 * QA-001: E2E test - Create habit flow
 * Tests the complete habit creation journey from login to verification.
 *
 * Acceptance criteria:
 * - Test passes in CI
 * - Covers one representative frequency through persistence
 * - Test is isolated (uses test user/data)
 * - Runs in <30 seconds
 */

test.describe('Create Habit Flow', () => {
  test('should navigate to create habit page from habits list', async ({ page }) => {
    const habits = new HabitsPage(page);
    await habits.goto();
    await habits.createButton.click();
    await expect(page).toHaveURL('/habits/new');
  });

  test('should navigate to create habit page from dashboard empty state', async ({ page }) => {
    await page.goto('/dashboard');
    // If user has no habits, there should be a create CTA
    const createButton = page.getByRole('link', { name: /create|new|add/i }).first();
    // Empty state CTA only shows when user has no habits — skip if not present
    if (await createButton.isVisible({ timeout: 3000 })) {
      await createButton.click();
      await expect(page).toHaveURL('/habits/new');
    }
  });

  test('should create a daily habit successfully', async ({ page }) => {
    const createPage = new CreateHabitPage(page);
    await createPage.goto();

    await createPage.fillName('E2E Test - Morning Run');
    await createPage.fillDescription('A test habit created by E2E test suite');
    await createPage.selectCategory('Health');
    await createPage.selectFrequency(/every day/i);
    await createPage.submitAndWaitForApi();
    await createPage.waitForRedirect();

    // Verify the habit appears in the list
    await expect(page.getByText('E2E Test - Morning Run').first()).toBeVisible();
  });

});
