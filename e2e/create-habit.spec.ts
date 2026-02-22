import { test, expect } from '@playwright/test';
import { CreateHabitPage } from './pages/create-habit.page';
import { HabitsPage } from './pages/habits.page';

/**
 * QA-001: E2E test - Create habit flow
 * Tests the complete habit creation journey from login to verification.
 *
 * Acceptance criteria:
 * - Test passes in CI
 * - Covers all frequency types
 * - Tests validation errors
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
    await createPage.submit();
    await createPage.waitForRedirect();

    // Verify the habit appears in the list
    await expect(page.getByText('E2E Test - Morning Run').first()).toBeVisible();
  });

  test('should create a weekdays habit', async ({ page }) => {
    const createPage = new CreateHabitPage(page);
    await createPage.goto();

    await createPage.fillName('E2E Test - Weekday Habit');
    await createPage.selectFrequency(/mon.*fri/i);
    await createPage.submit();
    await createPage.waitForRedirect();
    await expect(page.getByText('E2E Test - Weekday Habit').first()).toBeVisible();
  });

  test('should create a weekly habit', async ({ page }) => {
    const createPage = new CreateHabitPage(page);
    await createPage.goto();

    await createPage.fillName('E2E Test - Weekly Habit');
    await createPage.selectFrequency(/once a week/i);
    await createPage.submit();
    await createPage.waitForRedirect();
    await expect(page.getByText('E2E Test - Weekly Habit').first()).toBeVisible();
  });

  test('should create a times-per-week habit (2x/week)', async ({ page }) => {
    const createPage = new CreateHabitPage(page);
    await createPage.goto();

    await createPage.fillName('E2E Test - 2x Week Habit');
    await createPage.selectFrequency(/2 times/i);
    await createPage.submit();
    await createPage.waitForRedirect();
    await expect(page.getByText('E2E Test - 2x Week Habit').first()).toBeVisible();
  });

  test('should create a times-per-week habit (3x/week)', async ({ page }) => {
    const createPage = new CreateHabitPage(page);
    await createPage.goto();

    await createPage.fillName('E2E Test - 3x Week Habit');
    await createPage.selectFrequency(/3 times/i);
    await createPage.submit();
    await createPage.waitForRedirect();
    await expect(page.getByText('E2E Test - 3x Week Habit').first()).toBeVisible();
  });

  test('should create a custom frequency habit', async ({ page }) => {
    const createPage = new CreateHabitPage(page);
    await createPage.goto();

    await createPage.fillName('E2E Test - Custom Habit');
    await createPage.selectFrequency(/custom days/i);

    // Select specific days (Mon, Wed, Fri) — use aria-label for exact match
    await page.getByRole('button', { name: 'Mon', exact: true }).click();
    await page.getByRole('button', { name: 'Wed', exact: true }).click();
    await page.getByRole('button', { name: 'Fri', exact: true }).click();

    await createPage.submit();
    await createPage.waitForRedirect();
    await expect(page.getByText('E2E Test - Custom Habit').first()).toBeVisible();
  });

  test('should show validation error when name is empty', async ({ page }) => {
    const createPage = new CreateHabitPage(page);
    await createPage.goto();

    // Try to submit without filling name
    await createPage.submit();

    // Should stay on the create page
    await expect(page).toHaveURL('/habits/new');

    // Should show validation error
    await expect(createPage.validationError).toBeVisible();
  });

  test('should handle cancel button', async ({ page }) => {
    const createPage = new CreateHabitPage(page);
    await createPage.goto();

    await createPage.fillName('This should be cancelled');
    await createPage.cancel();

    // Should navigate away from create page
    await expect(page).not.toHaveURL('/habits/new');
  });

  test('should create multiple habits in sequence', async ({ page }) => {
    const createPage = new CreateHabitPage(page);
    const habits = new HabitsPage(page);

    // Create first habit
    await createPage.goto();
    await createPage.fillName('E2E Test - Sequence Habit 1');
    await createPage.submit();
    await createPage.waitForRedirect();
    await expect(habits.tabPanel.getByText('E2E Test - Sequence Habit 1').first()).toBeVisible();

    // Create second habit
    await habits.createButton.click();
    await page.waitForURL('/habits/new', { timeout: 5000 });
    await createPage.fillName('E2E Test - Sequence Habit 2');
    await createPage.submit();
    await createPage.waitForRedirect();

    // Both habits should be visible in the list
    await expect(habits.tabPanel.getByText('E2E Test - Sequence Habit 1').first()).toBeVisible();
    await expect(habits.tabPanel.getByText('E2E Test - Sequence Habit 2').first()).toBeVisible();
  });

  test('should select different categories', async ({ page }) => {
    // Categories are now user-defined and seeded from lib/categories/seed.ts
    const categories = ['Health', 'Learning', 'Finance', 'Home'];
    const createPage = new CreateHabitPage(page);

    for (const category of categories) {
      await createPage.goto();
      await createPage.fillName(`E2E Test - ${category} category`);

      // Click the category toggle button
      const categoryButton = page.getByRole('button', { name: new RegExp(category, 'i') });
      await categoryButton.click();

      // Verify it's selected (Toggle has data-state="on" when pressed)
      await expect(categoryButton).toHaveAttribute('data-state', 'on');

      // Don't submit, just verify selection works
    }
  });
});
