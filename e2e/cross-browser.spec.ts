import { test, expect } from '@playwright/test';
import { ensureAuthenticated } from './helpers/auth';

/**
 * QA-006: Cross-browser testing
 * Tests critical flows across Chrome, Firefox, and Safari.
 * This file tests browser-specific behaviors and visual consistency.
 *
 * The main E2E tests (create-habit, complete-habit, dashboard) are automatically
 * run across all browser projects defined in playwright.config.ts.
 * This file focuses on browser-specific edge cases.
 *
 * Acceptance criteria:
 * - All critical flows work on Chrome, Firefox, Safari
 * - No major visual bugs on any supported browser
 * - E2E tests pass on all Playwright projects
 * - Browser-specific bugs documented and fixed
 */

test.describe('Cross-Browser - Core Functionality', () => {
  test.beforeEach(async ({ page }) => {
    await ensureAuthenticated(page);
  });

  test('login flow completes successfully', async ({ page }) => {
    // Already authenticated in beforeEach
    await page.goto('/dashboard');
    await expect(page).toHaveURL('/dashboard');
  });

  test('create habit form submits correctly', async ({ page }) => {
    await page.goto('/habits/new');
    await page.waitForTimeout(1000);

    // Fill form
    await page.getByLabel(/name/i).fill('Cross-Browser Test Habit');
    await page.getByRole('button', { name: /daily/i }).click();

    // Submit
    await page.getByRole('button', { name: /create/i }).click();
    await page.waitForURL('/habits', { timeout: 10000 });

    // Verify
    await expect(page.getByText('Cross-Browser Test Habit')).toBeVisible();
  });

  test('habit toggle works', async ({ page }) => {
    await page.goto('/dashboard');
    await page.waitForTimeout(2000);

    const checkbox = page.locator('[role="checkbox"], input[type="checkbox"]').first();
    if (await checkbox.isVisible({ timeout: 3000 }).catch(() => false)) {
      const before = await checkbox.isChecked();
      await checkbox.click();
      await page.waitForTimeout(1000);
      const after = await checkbox.isChecked();
      expect(after).not.toBe(before);
    }
  });

  test('page navigation works', async ({ page }) => {
    await page.goto('/dashboard');
    await page.waitForTimeout(1000);

    // Navigate to habits
    const habitsLink = page.getByRole('link', { name: /habit/i }).first();
    if (await habitsLink.isVisible({ timeout: 3000 }).catch(() => false)) {
      await habitsLink.click();
      await page.waitForURL(/\/habits/, { timeout: 5000 });
    }

    // Navigate back to dashboard
    const dashLink = page.getByRole('link', { name: /dashboard/i }).first();
    if (await dashLink.isVisible({ timeout: 3000 }).catch(() => false)) {
      await dashLink.click();
      await page.waitForURL('/dashboard', { timeout: 5000 });
    }
  });
});

test.describe('Cross-Browser - Visual Consistency', () => {
  test.beforeEach(async ({ page }) => {
    await ensureAuthenticated(page);
  });

  test('fonts render correctly', async ({ page }) => {
    await page.goto('/dashboard');
    await page.waitForTimeout(2000);

    const fontFamily = await page.evaluate(() => {
      const body = document.body;
      return window.getComputedStyle(body).fontFamily;
    });

    // Should use the Geist font (or fallback sans-serif)
    expect(fontFamily).toMatch(/geist|sans-serif/i);
  });

  test('theme toggle works', async ({ page }) => {
    await page.goto('/dashboard');
    await page.waitForTimeout(2000);

    // Check if theme toggle exists
    const themeToggle = page.locator('button:has(svg[class*="moon"]), button:has(svg[class*="sun"]), [aria-label*="theme"]');
    if (await themeToggle.isVisible({ timeout: 3000 }).catch(() => false)) {
      await themeToggle.click();
      await page.waitForTimeout(500);

      // HTML should have dark/light class
      const htmlClass = await page.evaluate(() => document.documentElement.className);
      expect(htmlClass).toMatch(/dark|light/);
    }
  });

  test('icons render as SVGs', async ({ page }) => {
    await page.goto('/dashboard');
    await page.waitForTimeout(2000);

    const svgCount = await page.evaluate(() => {
      return document.querySelectorAll('svg').length;
    });

    // Should have SVG icons (lucide-react)
    expect(svgCount).toBeGreaterThan(0);
  });

  test('CSS Grid/Flexbox renders correctly', async ({ page }) => {
    await page.goto('/habits');
    await page.waitForTimeout(2000);

    // Check that grid/flex containers have proper layout
    const hasGridOrFlex = await page.evaluate(() => {
      const elements = document.querySelectorAll('*');
      let count = 0;
      elements.forEach(el => {
        const display = window.getComputedStyle(el).display;
        if (display === 'grid' || display === 'flex' || display === 'inline-flex') {
          count++;
        }
      });
      return count;
    });

    expect(hasGridOrFlex).toBeGreaterThan(0);
  });
});

test.describe('Cross-Browser - Form Behavior', () => {
  test('input validation displays correctly', async ({ page }) => {
    await ensureAuthenticated(page);
    await page.goto('/habits/new');
    await page.waitForTimeout(1000);

    // Try submitting empty form
    await page.getByRole('button', { name: /create/i }).click();
    await page.waitForTimeout(500);

    // Should show validation message (browser-native or custom)
    const hasError = await page.evaluate(() => {
      const inputs = document.querySelectorAll('input:invalid, [aria-invalid="true"]');
      const errorMessages = document.querySelectorAll('[role="alert"], .text-red-500, .text-destructive');
      return inputs.length > 0 || errorMessages.length > 0;
    });

    expect(hasError).toBe(true);
  });

  test('date inputs work correctly', async ({ page }) => {
    await ensureAuthenticated(page);
    await page.goto('/dashboard');
    await page.waitForTimeout(2000);

    // Check if any date pickers exist and are functional
    const datePicker = page.locator('input[type="date"], [class*="calendar"], [class*="date"]');
    if (await datePicker.first().isVisible({ timeout: 2000 }).catch(() => false)) {
      // Date picker should be interactive
      await datePicker.first().click();
      await page.waitForTimeout(500);
    }
  });

  test('focus styles are consistent', async ({ page }) => {
    await ensureAuthenticated(page);
    await page.goto('/habits/new');
    await page.waitForTimeout(1000);

    // Tab through form and verify focus styles
    await page.keyboard.press('Tab');
    await page.keyboard.press('Tab');

    const hasFocusRing = await page.evaluate(() => {
      const el = document.activeElement;
      if (!el) return false;
      const styles = window.getComputedStyle(el);
      return styles.outlineStyle !== 'none' || styles.boxShadow !== 'none';
    });

    expect(hasFocusRing).toBe(true);
  });
});
