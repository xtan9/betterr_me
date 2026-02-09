import type { Page } from '@playwright/test';
import { habitCheckbox } from '../helpers/checkbox';

export class HabitsPage {
  constructor(private page: Page) {}

  async goto() {
    await this.page.goto('/habits');
    await this.page.waitForLoadState('networkidle');
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
