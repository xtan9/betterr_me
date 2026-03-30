import type { Page } from '@playwright/test';
import { habitCheckbox } from '../helpers/checkbox';

export class HabitsPage {
  constructor(private page: Page) {}

  async goto() {
    await this.page.goto('/habits');
    // Wait for DOM content to be ready before looking for page elements
    await this.page.waitForLoadState('domcontentloaded');
    // Wait for page content instead of networkidle (SWR polling prevents idle).
    // Use 30s timeout — CI production builds can be slow on first page load.
    await this.page
      .locator('[data-testid^="habit-card"], [data-testid="empty-state"], h1')
      .first()
      .waitFor({ timeout: 30000 });
  }

  /** "Create Habit" button on the habits list page */
  get createButton() {
    return this.page.getByRole('button', { name: /create habit/i });
  }

  /** Search input */
  get searchInput() {
    return this.page.getByPlaceholder(/search/i);
  }

  /** All habit cards */
  get habitCards() {
    return this.page.locator('[data-testid^="habit-card"]');
  }

  /** All cards (for layout tests) */
  get cards() {
    return this.page.locator('[data-testid^="habit-card"]');
  }

  /** Locate a habit checkbox by habit name */
  habitCheckbox(name: string) {
    return habitCheckbox(this.page, name);
  }

  /** Tab panel containing the habit list */
  get tabPanel() {
    return this.page.locator('[role="tabpanel"]');
  }
}
