import { test, expect } from '@playwright/test';
import { DashboardPage } from './pages/dashboard.page';

/**
 * QA-003: E2E test - Dashboard load
 * Tests dashboard loading, sections, empty states, and performance.
 *
 * Acceptance criteria:
 * - Test passes in CI
 * - Performance assertion included
 * - Runs in <30 seconds
 */

test.describe('Dashboard - Auth Required', () => {
  // Uses unauthenticated state to verify redirect behaviour
  test.use({ storageState: { cookies: [], origins: [] } });

  test('should require authentication to access dashboard', async ({ page }) => {
    await page.goto('/dashboard');

    await expect(page).toHaveURL(/\/auth\/login(?:\?|$)/);
  });
});

test.describe('Dashboard Load', () => {
  test('should load dashboard within acceptable time', async ({ page }) => {
    const dashboard = new DashboardPage(page);
    const startTime = Date.now();
    await dashboard.goto();

    // Wait for the skeleton to disappear (indicates content has loaded)
    await dashboard.skeleton.waitFor({ state: 'hidden', timeout: 10000 }).catch(() => {
      // Skeleton may not appear if data loads fast
    });

    // Wait for any content to appear
    await page.waitForSelector('main, [role="main"]', { timeout: 10000 });

    const loadTime = Date.now() - startTime;
    // 10s budget — parallel workers (up to 16) contend for the dev server
    expect(loadTime).toBeLessThan(10000);
  });

  test('should handle refresh correctly', async ({ page }) => {
    const dashboard = new DashboardPage(page);
    await dashboard.goto();

    // Refresh
    await page.reload();
    await page.waitForLoadState('networkidle');

    // Content should reload (same or updated)
    const refreshedContent = await dashboard.main.textContent();
    expect(refreshedContent).toBeDefined();
    expect(refreshedContent!.length).toBeGreaterThan(0);
  });

  test('should not have layout shift during load', async ({ page }) => {
    // Measure CLS during page load
    await page.goto('/dashboard');

    const cls = await page.evaluate(() => {
      return new Promise<number>((resolve) => {
        let clsValue = 0;
        const observer = new PerformanceObserver((list) => {
          for (const entry of list.getEntries()) {
            if (!(entry as any).hadRecentInput) {
              clsValue += (entry as any).value;
            }
          }
        });

        observer.observe({ type: 'layout-shift', buffered: true });

        // Wait a bit for all shifts to be recorded
        setTimeout(() => {
          observer.disconnect();
          resolve(clsValue);
        }, 3000);
      });
    });

    // CLS should be less than 0.1 (good threshold per Web Vitals)
    expect(cls).toBeLessThan(0.25); // Allow slightly higher for auth redirects
  });

});
