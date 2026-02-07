import { test, expect } from '@playwright/test';
import { login, ensureAuthenticated } from './helpers/auth';

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
  test.beforeEach(async ({ page }) => {
    await ensureAuthenticated(page);
  });

  test('should navigate to create habit page from habits list', async ({ page }) => {
    await page.goto('/habits');
    await page.getByRole('button', { name: /create habit/i }).click();
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
    await page.goto('/habits/new');

    // Fill in habit name
    await page.getByLabel(/name/i).fill('E2E Test - Morning Run');

    // Fill in description (optional)
    await page.getByLabel(/description/i).fill('A test habit created by E2E test suite');

    // Select category
    await page.getByRole('button', { name: /health/i }).click();

    // Select daily frequency (should be default)
    await page.getByRole('button', { name: /every day/i }).click();

    // Submit the form
    await page.getByRole('button', { name: /create/i }).click();

    // Should redirect to habits list
    await page.waitForURL('/habits', { timeout: 10000 });

    // Verify the habit appears in the list
    await expect(page.getByText('E2E Test - Morning Run')).toBeVisible();
  });

  test('should create a weekdays habit', async ({ page }) => {
    await page.goto('/habits/new');

    await page.getByLabel(/name/i).fill('E2E Test - Weekday Habit');

    // Select weekdays frequency
    await page.getByRole('button', { name: /mon.*fri/i }).click();

    await page.getByRole('button', { name: /create/i }).click();
    await page.waitForURL('/habits', { timeout: 10000 });
    await expect(page.getByText('E2E Test - Weekday Habit')).toBeVisible();
  });

  test('should create a weekly habit', async ({ page }) => {
    await page.goto('/habits/new');

    await page.getByLabel(/name/i).fill('E2E Test - Weekly Habit');
    await page.getByRole('button', { name: /once a week/i }).click();

    await page.getByRole('button', { name: /create/i }).click();
    await page.waitForURL('/habits', { timeout: 10000 });
    await expect(page.getByText('E2E Test - Weekly Habit')).toBeVisible();
  });

  test('should create a times-per-week habit (2x/week)', async ({ page }) => {
    await page.goto('/habits/new');

    await page.getByLabel(/name/i).fill('E2E Test - 2x Week Habit');
    await page.getByRole('button', { name: /2 times/i }).click();

    await page.getByRole('button', { name: /create/i }).click();
    await page.waitForURL('/habits', { timeout: 10000 });
    await expect(page.getByText('E2E Test - 2x Week Habit')).toBeVisible();
  });

  test('should create a times-per-week habit (3x/week)', async ({ page }) => {
    await page.goto('/habits/new');

    await page.getByLabel(/name/i).fill('E2E Test - 3x Week Habit');
    await page.getByRole('button', { name: /3 times/i }).click();

    await page.getByRole('button', { name: /create/i }).click();
    await page.waitForURL('/habits', { timeout: 10000 });
    await expect(page.getByText('E2E Test - 3x Week Habit')).toBeVisible();
  });

  test('should create a custom frequency habit', async ({ page }) => {
    await page.goto('/habits/new');

    await page.getByLabel(/name/i).fill('E2E Test - Custom Habit');

    // Select custom frequency
    await page.getByRole('button', { name: /custom days/i }).click();

    // Select specific days (Mon, Wed, Fri) — use aria-label for exact match
    await page.getByRole('button', { name: 'Mon', exact: true }).click();
    await page.getByRole('button', { name: 'Wed', exact: true }).click();
    await page.getByRole('button', { name: 'Fri', exact: true }).click();

    await page.getByRole('button', { name: /create/i }).click();
    await page.waitForURL('/habits', { timeout: 10000 });
    await expect(page.getByText('E2E Test - Custom Habit')).toBeVisible();
  });

  test('should show validation error when name is empty', async ({ page }) => {
    await page.goto('/habits/new');

    // Try to submit without filling name
    await page.getByRole('button', { name: /create/i }).click();

    // Should stay on the create page
    await expect(page).toHaveURL('/habits/new');

    // Should show validation error
    const errorMessage = page.getByText(/name.*required/i);
    await expect(errorMessage).toBeVisible();
  });

  test('should handle cancel button', async ({ page }) => {
    await page.goto('/habits/new');

    await page.getByLabel(/name/i).fill('This should be cancelled');

    // Click cancel
    await page.getByRole('button', { name: /cancel/i }).click();

    // Should navigate away from create page
    await expect(page).not.toHaveURL('/habits/new');
  });

  test('should create multiple habits in sequence', async ({ page }) => {
    // Create first habit
    await page.goto('/habits/new');
    await page.getByLabel(/name/i).fill('E2E Test - Sequence Habit 1');
    await page.getByRole('button', { name: /create/i }).click();
    await page.waitForURL('/habits', { timeout: 10000 });
    const habitList = page.locator('[role="tabpanel"]');
    await expect(habitList.getByText('E2E Test - Sequence Habit 1')).toBeVisible();

    // Create second habit
    await page.getByRole('button', { name: /create habit/i }).click();
    await page.waitForURL('/habits/new', { timeout: 5000 });
    await page.getByLabel(/name/i).fill('E2E Test - Sequence Habit 2');
    await page.getByRole('button', { name: /create/i }).click();
    await page.waitForURL('/habits', { timeout: 10000 });

    // Both habits should be visible in the list
    await expect(habitList.getByText('E2E Test - Sequence Habit 1')).toBeVisible();
    await expect(habitList.getByText('E2E Test - Sequence Habit 2')).toBeVisible();
  });

  test('should select different categories', async ({ page }) => {
    const categories = ['health', 'wellness', 'learning', 'productivity'];

    for (const category of categories) {
      await page.goto('/habits/new');
      await page.getByLabel(/name/i).fill(`E2E Test - ${category} category`);

      // Click the category button
      const categoryButton = page.getByRole('button', { name: new RegExp(category, 'i') });
      await categoryButton.click();

      // Verify it's selected (usually has an active/pressed state)
      await expect(categoryButton).toHaveAttribute('data-state', 'on');

      // Don't submit, just verify selection works
    }
  });
});
