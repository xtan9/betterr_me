import { defineConfig, devices } from '@playwright/test';

const STORAGE_STATE = 'e2e/.auth/user.json';

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

  projects: [
    // Auth setup — runs once, saves session for all browser projects
    {
      name: 'setup',
      testMatch: /.*\.setup\.ts/,
    },

    // Desktop browsers
    {
      name: 'chromium',
      dependencies: ['setup'],
      use: { ...devices['Desktop Chrome'], storageState: STORAGE_STATE },
    },
    {
      name: 'firefox',
      dependencies: ['setup'],
      use: { ...devices['Desktop Firefox'], storageState: STORAGE_STATE },
    },
    {
      name: 'webkit',
      dependencies: ['setup'],
      use: { ...devices['Desktop Safari'], storageState: STORAGE_STATE },
    },

    // QA-007: Mobile responsive testing
    {
      name: 'mobile-chrome',
      dependencies: ['setup'],
      use: { ...devices['Pixel 5'], storageState: STORAGE_STATE },
    },
    {
      name: 'mobile-safari',
      dependencies: ['setup'],
      use: { ...devices['iPhone 12'], storageState: STORAGE_STATE },
    },

    // QA-007: Tablet viewport
    {
      name: 'tablet',
      dependencies: ['setup'],
      use: {
        ...devices['iPad (gen 7)'],
        storageState: STORAGE_STATE,
      },
    },

    // QA-007: Small mobile (375px minimum supported width)
    {
      name: 'mobile-small',
      dependencies: ['setup'],
      use: {
        viewport: { width: 375, height: 667 },
        userAgent: devices['iPhone SE'].userAgent,
        isMobile: true,
        hasTouch: true,
        storageState: STORAGE_STATE,
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
