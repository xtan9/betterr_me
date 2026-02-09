import { test, expect } from '@playwright/test';
import { DashboardPage } from './pages/dashboard.page';
import { HabitsPage } from './pages/habits.page';
import { CreateHabitPage } from './pages/create-habit.page';
import { toggleAndVerify } from './helpers/checkbox';

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
  test('login flow completes successfully', async ({ page }) => {
    // Already authenticated via storageState
    await page.goto('/dashboard');
    await expect(page).toHaveURL('/dashboard');
  });

  test('create habit form submits correctly', async ({ page }) => {
    const createPage = new CreateHabitPage(page);
    await createPage.goto();

    await createPage.fillName('E2E Test - Cross-Browser Habit');
    await createPage.selectFrequency(/every day/i);
    await createPage.submit();
    await createPage.waitForRedirect();

    // Verify — use .first() in case duplicates linger from a previous run
    await expect(page.getByText('E2E Test - Cross-Browser Habit').first()).toBeVisible();
  });

  test('habit toggle works', async ({ page }) => {
    const dashboard = new DashboardPage(page);
    await dashboard.goto();

    // Target a specific seed habit to avoid parallel contention with other test files
    const checkbox = dashboard.habitCheckbox('E2E Test - Seed Habit 3');
    await expect(checkbox).toBeVisible({ timeout: 10000 });

    await toggleAndVerify(checkbox);
  });

  test('page navigation works', async ({ page }) => {
    const dashboard = new DashboardPage(page);
    await dashboard.goto();

    // Navigate to habits
    const habitsLink = page.getByRole('link', { name: /habit/i }).first();
    await expect(habitsLink).toBeVisible({ timeout: 10000 });
    await habitsLink.click();
    await page.waitForURL(/\/habits/, { timeout: 5000 });

    // Navigate back to dashboard
    const dashLink = page.getByRole('link', { name: /dashboard/i }).first();
    await expect(dashLink).toBeVisible({ timeout: 10000 });
    await dashLink.click();
    await page.waitForURL('/dashboard', { timeout: 5000 });
  });
});

test.describe('Cross-Browser - Visual Consistency', () => {
  test('fonts render correctly', async ({ page }) => {
    const dashboard = new DashboardPage(page);
    await dashboard.goto();

    const fontFamily = await page.evaluate(() => {
      const body = document.body;
      return window.getComputedStyle(body).fontFamily;
    });

    // Should use the Inter font (or fallback sans-serif)
    expect(fontFamily).toMatch(/inter|sans-serif/i);
  });

  test('theme toggle works', async ({ page }) => {
    const dashboard = new DashboardPage(page);
    await dashboard.goto();

    // Check if theme toggle exists
    const themeToggle = page.locator('button:has(svg[class*="moon"]), button:has(svg[class*="sun"]), [aria-label*="theme"]');
    await expect(themeToggle).toBeVisible({ timeout: 10000 });
    await themeToggle.click();

    // HTML should have dark/light class
    await expect(page.locator('html')).toHaveAttribute('class', /dark|light/);
  });

  test('icons render as SVGs', async ({ page }) => {
    const dashboard = new DashboardPage(page);
    await dashboard.goto();

    const svgCount = await page.evaluate(() => {
      return document.querySelectorAll('svg').length;
    });

    // Should have SVG icons (lucide-react)
    expect(svgCount).toBeGreaterThan(0);
  });

  test('CSS Grid/Flexbox renders correctly', async ({ page }) => {
    const habits = new HabitsPage(page);
    await habits.goto();

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
    const createPage = new CreateHabitPage(page);
    await createPage.goto();

    // Try submitting empty form
    await createPage.submit();

    // Should show validation message (browser-native or custom)
    const hasError = await page.evaluate(() => {
      const inputs = document.querySelectorAll('input:invalid, [aria-invalid="true"]');
      const errorMessages = document.querySelectorAll('[role="alert"], .text-red-500, .text-destructive');
      return inputs.length > 0 || errorMessages.length > 0;
    });

    expect(hasError).toBe(true);
  });

  test('date inputs work correctly', async ({ page }) => {
    const dashboard = new DashboardPage(page);
    await dashboard.goto();

    // Check if any date pickers exist and are functional
    const datePicker = page.locator('input[type="date"], [class*="calendar"], [class*="date"]');
    const count = await datePicker.count();
    if (count > 0) {
      await expect(datePicker.first()).toBeVisible({ timeout: 5000 });
      await datePicker.first().click();
    }
  });

  test('focus styles are consistent', async ({ page }) => {
    const createPage = new CreateHabitPage(page);
    await createPage.goto();

    // Focus the name input directly — tabbing order varies by browser/viewport
    await createPage.nameInput.focus();

    const hasFocusRing = await page.evaluate(() => {
      const el = document.activeElement;
      if (!el) return false;
      const styles = window.getComputedStyle(el);
      return (styles.outlineStyle !== 'none' && styles.outlineWidth !== '0px') ||
             styles.boxShadow !== 'none';
    });

    expect(hasFocusRing).toBe(true);
  });
});
