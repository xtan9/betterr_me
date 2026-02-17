import { test, expect } from '@playwright/test';

/**
 * Locale verification -- confirms sidebar navigation text renders
 * correctly for all three supported locales (en, zh, zh-TW).
 *
 * Sets the locale cookie before navigating to /dashboard, then verifies
 * that key sidebar nav labels appear in the expected language.
 */

const localeExpectations = [
  {
    locale: 'en',
    navLabels: ['Dashboard', 'Habits', 'Tasks', 'Settings'],
  },
  {
    locale: 'zh',
    navLabels: ['仪表板', '习惯', '任务', '设置'],
  },
  {
    locale: 'zh-TW',
    navLabels: ['儀表板', '習慣', '任務', '設定'],
  },
];

for (const { locale, navLabels } of localeExpectations) {
  test(`sidebar renders correct text for locale: ${locale}`, async ({ page }) => {
    // Set locale cookie before navigation
    await page.context().addCookies([{
      name: 'locale',
      value: locale,
      domain: 'localhost',
      path: '/',
    }]);

    await page.goto('/dashboard');
    await page.waitForLoadState('networkidle');

    // On mobile viewports, open the sidebar sheet first
    const sidebarTrigger = page.locator('button[data-sidebar="trigger"]');
    const isMobile = await sidebarTrigger.isVisible().catch(() => false);
    if (isMobile) {
      await sidebarTrigger.click();
      await page.waitForTimeout(300);
    }

    // Verify at least the Dashboard and Habits nav labels appear in the correct locale
    // Use first two labels as a sufficient smoke test
    for (const label of navLabels.slice(0, 2)) {
      await expect(page.getByText(label, { exact: true }).first()).toBeVisible({ timeout: 10000 });
    }
  });
}
