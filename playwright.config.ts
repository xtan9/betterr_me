import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright configuration for E2E testing
 * Covers QA-001 through QA-003 (E2E tests), QA-006 (cross-browser), QA-007 (mobile responsive)
 */
export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI ? 'html' : 'list',
  timeout: 30000,
  globalTeardown: './e2e/global-teardown.ts',

  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:3000',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },

  /* QA-006: Cross-browser testing - Chrome, Firefox, Safari */
  projects: [
    // Desktop browsers
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'firefox',
      use: { ...devices['Desktop Firefox'] },
    },
    {
      name: 'webkit',
      use: { ...devices['Desktop Safari'] },
    },

    // QA-007: Mobile responsive testing
    {
      name: 'mobile-chrome',
      use: { ...devices['Pixel 5'] },
    },
    {
      name: 'mobile-safari',
      use: { ...devices['iPhone 12'] },
    },

    // QA-007: Tablet viewport
    {
      name: 'tablet',
      use: {
        ...devices['iPad (gen 7)'],
      },
    },

    // QA-007: Small mobile (375px minimum supported width)
    {
      name: 'mobile-small',
      use: {
        viewport: { width: 375, height: 667 },
        userAgent: devices['iPhone SE'].userAgent,
        isMobile: true,
        hasTouch: true,
      },
    },
  ],

  /* Start server before running tests.
   * CI uses production build (pnpm start) for realistic testing.
   * Local dev uses pnpm dev with server reuse for faster iteration. */
  webServer: {
    command: process.env.CI ? 'pnpm start' : 'pnpm dev',
    url: 'http://localhost:3000',
    reuseExistingServer: !process.env.CI,
    timeout: 120000,
  },
});
