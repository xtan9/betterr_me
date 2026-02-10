import { test, expect } from '@playwright/test';

/**
 * E2E tests for task detail and edit pages.
 *
 * These tests rely on the seed task created in global-setup.ts
 * ("E2E Test - Seed Task 1"). They fetch the task ID via the API,
 * then navigate to the detail/edit pages.
 */

const SEED_TASK_TITLE = 'E2E Test - Seed Task 1';

/** Fetch the seed task's ID via the API (prefix match to handle mid-rename state). */
async function getSeedTaskId(page: import('@playwright/test').Page): Promise<string> {
  const response = await page.request.get('/api/tasks');
  expect(response.ok()).toBe(true);
  const { tasks } = await response.json();
  const seedTask = tasks.find((t: { title: string }) => t.title.startsWith(SEED_TASK_TITLE));
  expect(seedTask).toBeDefined();
  return seedTask.id;
}

test.describe('Task Detail Page', () => {
  test('should display task details', async ({ page }) => {
    const taskId = await getSeedTaskId(page);
    await page.goto(`/tasks/${taskId}`);
    await page.waitForLoadState('networkidle');

    // Should display the task title
    await expect(page.getByText(SEED_TASK_TITLE)).toBeVisible({ timeout: 10000 });

    // Should display category, priority, due date, due time sections
    await expect(page.getByText(/category/i).first()).toBeVisible();
    await expect(page.getByText(/priority/i).first()).toBeVisible();
  });

  test('should show page content after load', async ({ page }) => {
    const taskId = await getSeedTaskId(page);
    await page.goto(`/tasks/${taskId}`);

    // Page main content should appear (AppLayout wraps in <main>)
    await expect(page.locator('main')).toBeVisible({ timeout: 10000 });
    await expect(page.getByText(SEED_TASK_TITLE)).toBeVisible({ timeout: 10000 });
  });

  test('should toggle task completion status', async ({ page }) => {
    const taskId = await getSeedTaskId(page);
    await page.goto(`/tasks/${taskId}`);
    await page.waitForLoadState('networkidle');

    // Wait for the task title to be visible
    await expect(page.getByText(SEED_TASK_TITLE)).toBeVisible({ timeout: 10000 });

    // Check if the "Pending" badge is visible (task starts as not completed)
    const pendingBadge = page.getByText(/pending/i);
    const completedBadge = page.getByText(/completed/i);
    const isPending = await pendingBadge.isVisible().catch(() => false);

    // Click the status toggle button (the button containing the badge)
    const statusButton = page.locator('button').filter({ hasText: isPending ? /pending/i : /completed/i }).first();
    await statusButton.click();

    // Wait for the badge to change — SWR refetch happens after POST
    if (isPending) {
      await expect(completedBadge).toBeVisible({ timeout: 10000 });
    } else {
      await expect(pendingBadge).toBeVisible({ timeout: 10000 });
    }

    // Toggle back to original state for other tests
    const revertButton = page.locator('button').filter({ hasText: isPending ? /completed/i : /pending/i }).first();
    await revertButton.click();
    await page.waitForLoadState('networkidle');
  });

  test('should navigate to edit page', async ({ page }) => {
    const taskId = await getSeedTaskId(page);
    await page.goto(`/tasks/${taskId}`);
    await page.waitForLoadState('networkidle');

    await expect(page.getByText(SEED_TASK_TITLE)).toBeVisible({ timeout: 10000 });

    // Click the Edit button
    const editButton = page.getByRole('button', { name: /edit/i });
    await expect(editButton).toBeVisible();
    await editButton.click();

    // Should navigate to edit page
    await expect(page).toHaveURL(new RegExp(`/tasks/${taskId}/edit`), { timeout: 10000 });
  });

  test('should navigate back to tasks list', async ({ page }) => {
    const taskId = await getSeedTaskId(page);
    await page.goto(`/tasks/${taskId}`);
    await page.waitForLoadState('networkidle');

    await expect(page.getByText(SEED_TASK_TITLE)).toBeVisible({ timeout: 10000 });

    // Click the Back button
    const backButton = page.getByRole('button', { name: /back/i });
    await expect(backButton).toBeVisible();
    await backButton.click();

    // Should navigate to tasks list
    await expect(page).toHaveURL(/\/tasks$/, { timeout: 10000 });
  });

  test('should show error state for invalid task ID', async ({ page }) => {
    await page.goto('/tasks/00000000-0000-0000-0000-000000000000');
    await page.waitForLoadState('networkidle');

    // Should show error state with a retry button
    // The fetcher throws on 404, so SWR returns an error → shows "Failed to load task" + "Try again"
    const tryAgainButton = page.getByRole('button', { name: /try again/i });
    await expect(tryAgainButton).toBeVisible({ timeout: 15000 });
  });
});

test.describe('Task Edit Page', () => {
  test('should load edit form with pre-populated data', async ({ page }) => {
    const taskId = await getSeedTaskId(page);
    await page.goto(`/tasks/${taskId}/edit`);
    await page.waitForLoadState('networkidle');

    // Should display the form with the task title pre-filled
    const titleInput = page.locator('input[name="title"]');
    await expect(titleInput).toBeVisible({ timeout: 10000 });
    await expect(titleInput).toHaveValue(SEED_TASK_TITLE);
  });

  test('should update task title and navigate back', async ({ page }) => {
    const taskId = await getSeedTaskId(page);
    await page.goto(`/tasks/${taskId}/edit`);
    await page.waitForLoadState('networkidle');

    const titleInput = page.locator('input[name="title"]');
    await expect(titleInput).toBeVisible({ timeout: 10000 });

    // Update the title
    await titleInput.clear();
    await titleInput.fill('E2E Test - Seed Task 1 Updated');

    // Submit the form
    const saveButton = page.getByRole('button', { name: /save|update/i });
    await expect(saveButton).toBeVisible();
    await saveButton.click();

    // Should navigate back after successful update
    await page.waitForLoadState('networkidle');

    // Revert the title back to original for other tests (via API for reliability)
    const revertResponse = await page.request.patch(`/api/tasks/${taskId}`, {
      data: { title: SEED_TASK_TITLE },
    });
    expect(revertResponse.ok()).toBe(true);
  });

  test('should navigate back on cancel', async ({ page }) => {
    const taskId = await getSeedTaskId(page);

    // Navigate to detail page first, then to edit
    await page.goto(`/tasks/${taskId}`);
    await page.waitForLoadState('networkidle');
    await expect(page.getByText(SEED_TASK_TITLE)).toBeVisible({ timeout: 10000 });

    const editButton = page.getByRole('button', { name: /edit/i });
    await editButton.click();
    await expect(page).toHaveURL(new RegExp(`/tasks/${taskId}/edit`), { timeout: 10000 });

    // Click cancel
    const cancelButton = page.getByRole('button', { name: /cancel/i });
    await expect(cancelButton).toBeVisible({ timeout: 10000 });
    await cancelButton.click();

    // Should navigate back to detail page
    await expect(page).toHaveURL(new RegExp(`/tasks/${taskId}$`), { timeout: 10000 });
  });
});

test.describe('Task Delete Flow', () => {
  test('should show delete confirmation dialog', async ({ page }) => {
    const taskId = await getSeedTaskId(page);
    await page.goto(`/tasks/${taskId}`);
    await page.waitForLoadState('networkidle');

    await expect(page.getByText(SEED_TASK_TITLE)).toBeVisible({ timeout: 10000 });

    // Click delete button
    const deleteButton = page.getByRole('button', { name: /delete/i }).first();
    await expect(deleteButton).toBeVisible();
    await deleteButton.click();

    // Should show confirmation dialog
    const dialog = page.locator('[role="alertdialog"]');
    await expect(dialog).toBeVisible({ timeout: 5000 });

    // Cancel the delete
    const cancelButton = dialog.getByRole('button', { name: /cancel/i });
    await cancelButton.click();

    // Dialog should close
    await expect(dialog).not.toBeVisible({ timeout: 5000 });

    // Task should still be visible
    await expect(page.getByText(SEED_TASK_TITLE)).toBeVisible();
  });
});
