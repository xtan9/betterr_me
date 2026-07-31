import { expect, test } from '@playwright/test';
import { E2E_READ_ONLY } from './constants';

test.describe('Production-backed read-only smoke', () => {
  test.skip(!E2E_READ_ONLY, 'This smoke contract is reserved for production-backed verification');

  test('authenticated dashboard and collection reads are available', async ({ page, request }) => {
    await page.goto('/dashboard');
    await expect(page.locator('main')).toBeVisible({ timeout: 15_000 });

    const [habits, tasks] = await Promise.all([
      request.get('/api/habits'),
      request.get('/api/tasks'),
    ]);
    expect(habits.ok()).toBe(true);
    expect(tasks.ok()).toBe(true);
  });
});
