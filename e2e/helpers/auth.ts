import { type Page, expect } from '@playwright/test';

/**
 * Test user credentials for E2E testing.
 * These should be set via environment variables in CI.
 * For local development, use a dedicated test account.
 */
const email = process.env.E2E_TEST_EMAIL;
const password = process.env.E2E_TEST_PASSWORD;
if (!email || !password) {
  throw new Error(
    'E2E_TEST_EMAIL and E2E_TEST_PASSWORD must be set. ' +
    'See playwright.config.ts for setup instructions.'
  );
}
const TEST_USER = { email, password };

/**
 * Login with email/password and wait for dashboard redirect
 */
export async function login(page: Page): Promise<void> {
  await page.goto('/auth/login');
  await page.getByLabel(/email/i).fill(TEST_USER.email);
  await page.getByLabel(/password/i).fill(TEST_USER.password);
  await page.getByRole('button', { name: /log\s*in|sign\s*in/i }).click();
  await page.waitForURL('/dashboard', { timeout: 15000 });
  await expect(page).toHaveURL('/dashboard');
}

/**
 * Ensure user is authenticated, reusing session if possible
 */
export async function ensureAuthenticated(page: Page): Promise<void> {
  await page.goto('/dashboard');
  // If redirected to login, perform login
  if (page.url().includes('/auth/login')) {
    await login(page);
  }
  await expect(page).toHaveURL('/dashboard');
}

/**
 * Navigate to a protected page, logging in if necessary
 */
export async function navigateAuthenticated(page: Page, path: string): Promise<void> {
  await ensureAuthenticated(page);
  if (!page.url().endsWith(path)) {
    await page.goto(path);
  }
}
