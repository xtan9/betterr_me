import type { Page } from '@playwright/test';
import { habitCheckbox } from '../helpers/checkbox';

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

  /** Stat cards */
  get statCards() {
    return this.page.locator('[data-testid="stat-card"]');
  }

  /** Locate a habit checkbox by habit name */
  habitCheckbox(name: string) {
    return habitCheckbox(this.page, name);
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
