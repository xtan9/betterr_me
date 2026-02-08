import type { Page } from '@playwright/test';

export class DashboardPage {
  constructor(private page: Page) {}

  async goto() {
    await this.page.goto('/dashboard');
    await this.page.waitForLoadState('networkidle');
  }

  /** Greeting text element (Good morning/afternoon/evening or welcome) */
  get greeting() {
    return this.page.getByText(/good\s*(morning|afternoon|evening)|welcome|hello/i);
  }

  /** Main content area */
  get main() {
    return this.page.locator('main');
  }

  /** All navigation links */
  get navLinks() {
    return this.page.getByRole('link');
  }

  /** Stat cards (bordered rounded containers) */
  get statCards() {
    return this.page.locator('[class*="rounded-xl"][class*="border"]');
  }

  /** Locate a habit checkbox by habit name */
  habitCheckbox(name: string) {
    return this.page.locator(`[role="checkbox"][aria-label*="${name}"]`);
  }

  /** Dashboard skeleton loader */
  get skeleton() {
    return this.page.locator('[data-testid="dashboard-skeleton"]');
  }

  /** Completion progress text (e.g. "X of Y completed") */
  get completionText() {
    return this.page.getByText(/\d+\s*(of|\/)\s*\d+/i).first();
  }
}
