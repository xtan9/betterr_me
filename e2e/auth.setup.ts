import fs from 'node:fs';
import path from 'node:path';
import { test as setup, expect } from '@playwright/test';
import { STORAGE_STATE } from './constants';

/**
 * Playwright auth setup — runs once before all browser projects.
 * Logs in with the test account and saves session cookies to disk
 * so every test starts already authenticated.
 *
 * See: https://playwright.dev/docs/auth
 */
setup('authenticate', async ({ page }) => {
  const email = process.env.E2E_TEST_EMAIL;
  const password = process.env.E2E_TEST_PASSWORD;

  if (!email || !password) {
    throw new Error(
      'E2E_TEST_EMAIL and E2E_TEST_PASSWORD must be set. ' +
      'See playwright.config.ts for setup instructions.'
    );
  }

  await page.goto('/auth/login');
  await page.getByLabel(/email/i).fill(email);
  await page.getByLabel(/password/i).fill(password);
  await page.getByRole('button', { name: /log\s*in|sign\s*in/i }).click();
  await page.waitForURL('/dashboard', { timeout: 15000 });
  await expect(page).toHaveURL('/dashboard');

  fs.mkdirSync(path.dirname(STORAGE_STATE), { recursive: true });
  await page.context().storageState({ path: STORAGE_STATE });
});
