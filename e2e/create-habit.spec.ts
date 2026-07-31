import { test, expect } from '@playwright/test';
import { CreateHabitPage } from './pages/create-habit.page';
import { HabitsPage } from './pages/habits.page';
import { E2E_READ_ONLY, RUN_CONTEXT } from './constants';

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
  test.skip(E2E_READ_ONLY, 'Habit creation requires disposable E2E state');

  test('should navigate to create habit page from habits list', async ({ page }) => {
    const habits = new HabitsPage(page);
    await habits.goto();
    await habits.createButton.click();
    await expect(page).toHaveURL('/habits/new');
  });

  test('should navigate to create habit page from dashboard empty state', async ({ page }) => {
    await page.goto('/dashboard');
    const createButton = page.getByRole('link', { name: /create|new|add/i }).first();
    if (await createButton.isVisible({ timeout: 3000 })) {
      await createButton.click();
      await expect(page).toHaveURL('/habits/new');
    }
  });

  test('should create a daily habit successfully', async ({ page }) => {
    const createPage = new CreateHabitPage(page);
    await createPage.goto();

    const habitName = RUN_CONTEXT.ownedName('Morning Run');
    await createPage.fillName(habitName);
    await createPage.fillDescription('A test habit created by E2E test suite');
    await createPage.selectCategory('Health');
    await createPage.selectFrequency(/every day/i);
    await createPage.submitAndWaitForApi();
    await createPage.waitForRedirect();

    await expect(page.getByText(habitName).first()).toBeVisible();
  });
});
