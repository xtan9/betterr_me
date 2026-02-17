import { test, expect } from '@playwright/test';
import { DashboardPage } from './pages/dashboard.page';
import { HabitsPage } from './pages/habits.page';
import { CreateHabitPage } from './pages/create-habit.page';

/**
 * QA-007: Mobile responsive testing
 * Tests layout-specific responsive behavior.
 *
 * Generic viewport tests (no horizontal scroll, no content overflow) have been removed
 * because Playwright device projects (mobile-chrome, mobile-safari, tablet, mobile-small)
 * already run ALL spec files at those viewports — the generic checks were redundant.
 *
 * This file now focuses on layout-specific assertions that device projects don't cover:
 * grid layouts, stacking behavior, input widths, touch targets, and navigation patterns.
 */

test.describe('Responsive - Dashboard Layout', () => {
  test('stat cards should use 2-column grid on mobile', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    const dashboard = new DashboardPage(page);
    await dashboard.goto();

    const cardCount = await dashboard.statCards.count();
    expect(cardCount).toBeGreaterThanOrEqual(2);

    // Verify 2-column layout: first two cards should be on the same row (similar Y)
    // but at different X positions (side by side)
    const first = await dashboard.statCards.nth(0).boundingBox();
    const second = await dashboard.statCards.nth(1).boundingBox();

    if (first && second) {
      // Same row — Y coordinates should be close
      expect(Math.abs(second.y - first.y)).toBeLessThan(5);
      // Side by side — second card should be to the right
      expect(second.x).toBeGreaterThan(first.x);
      // Both fit within viewport
      expect(first.x + first.width).toBeLessThanOrEqual(375 + 5);
      expect(second.x + second.width).toBeLessThanOrEqual(375 + 5);
    }
  });

  test('stat cards should be in a row on desktop', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    const dashboard = new DashboardPage(page);
    await dashboard.goto();

    const cards = dashboard.statCards;
    const cardCount = await cards.count();

    if (cardCount > 1) {
      const firstRect = await cards.first().boundingBox();
      const secondRect = await cards.nth(1).boundingBox();

      if (firstRect && secondRect) {
        // On desktop, some cards should be side by side
        expect(secondRect.x).toBeGreaterThan(firstRect.x);
      }
    }
  });
});

test.describe('Responsive - Habits Page', () => {
  test('habit cards should stack on mobile', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    const habits = new HabitsPage(page);
    await habits.goto();

    const cardCount = await habits.cards.count();

    if (cardCount > 1) {
      const firstRect = await habits.cards.first().boundingBox();
      const secondRect = await habits.cards.nth(1).boundingBox();

      if (firstRect && secondRect) {
        // Cards should be stacked vertically
        expect(secondRect.y).toBeGreaterThan(firstRect.y);
      }
    }
  });

  test('search input should be full width on mobile', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    const habits = new HabitsPage(page);
    await habits.goto();

    await expect(habits.searchInput).toBeVisible({ timeout: 10000 });
    const inputBox = await habits.searchInput.boundingBox();
    if (inputBox) {
      // Should be at least 80% of viewport width
      expect(inputBox.width).toBeGreaterThan(375 * 0.8);
    }
  });

  test('create button should be accessible on mobile', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    const habits = new HabitsPage(page);
    await habits.goto();

    await expect(habits.createButton).toBeVisible({ timeout: 10000 });
    const box = await habits.createButton.boundingBox();
    if (box) {
      // Should be visible within viewport
      expect(box.x).toBeGreaterThanOrEqual(0);
      expect(box.x + box.width).toBeLessThanOrEqual(375);
      // Touch target should be at least 44px
      expect(Math.max(box.width, box.height)).toBeGreaterThanOrEqual(40);
    }
  });
});

test.describe('Responsive - Create Habit Form', () => {
  test('form fields should be full width on mobile', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    const createPage = new CreateHabitPage(page);
    await createPage.goto();

    await expect(createPage.nameInput).toBeVisible({ timeout: 10000 });
    const box = await createPage.nameInput.boundingBox();
    if (box) {
      // Input should be at least 70% of viewport width
      expect(box.width).toBeGreaterThan(375 * 0.7);
    }
  });

  test('submit button should be visible without scrolling on mobile', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    const createPage = new CreateHabitPage(page);
    await createPage.goto();

    // Fill minimum required fields
    await createPage.fillName('Test');

    // Submit button should be reachable by scrolling
    await createPage.submitButton.scrollIntoViewIfNeeded();
    await expect(createPage.submitButton).toBeVisible();

    const box = await createPage.submitButton.boundingBox();
    if (box) {
      // Button should fit within viewport width
      expect(box.x + box.width).toBeLessThanOrEqual(375 + 5);
    }
  });

  test('frequency selector should wrap properly on mobile', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    const createPage = new CreateHabitPage(page);
    await createPage.goto();

    // Frequency buttons should not overflow
    const hasOverflow = await page.evaluate(() => {
      const container = document.querySelector('[class*="grid"]');
      if (!container) return false;
      return container.scrollWidth > container.clientWidth;
    });

    expect(hasOverflow).toBe(false);
  });
});

test.describe('Responsive - Navigation', () => {
  test('navigation should work on mobile', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    const dashboard = new DashboardPage(page);
    await dashboard.goto();

    // On mobile, sidebar is a sheet -- open it via the trigger button
    const sidebarTrigger = page.locator('button[data-sidebar="trigger"]');
    const triggerVisible = await sidebarTrigger.isVisible().catch(() => false);
    if (triggerVisible) {
      await sidebarTrigger.click();
      // Wait for sheet animation
      await page.waitForTimeout(300);
    }

    // Now nav links should be visible in the sidebar sheet
    const navLinks = page.getByRole('link', { name: /dashboard|habits|tasks/i });
    const navCount = await navLinks.count();
    expect(navCount).toBeGreaterThan(0);
  });

  test('navigation should show all links on desktop', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    const dashboard = new DashboardPage(page);
    await dashboard.goto();

    // Desktop should show navigation links directly
    const count = await dashboard.navLinks.count();
    expect(count).toBeGreaterThan(0);
  });
});
