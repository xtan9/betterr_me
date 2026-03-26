import type { Page } from '@playwright/test';

export class CreateHabitPage {
  constructor(private page: Page) {}

  async goto() {
    await this.page.goto('/habits/new');
    // Wait for form to be interactive instead of networkidle (SWR polling prevents idle)
    await this.page.getByLabel(/name/i).waitFor({ timeout: 15000 });
  }

  /** Name input field */
  get nameInput() {
    return this.page.getByLabel(/name/i);
  }

  /** Description input field */
  get descriptionInput() {
    return this.page.getByLabel(/description/i);
  }

  /** Fill the habit name */
  async fillName(name: string) {
    await this.nameInput.fill(name);
  }

  /** Fill the habit description */
  async fillDescription(description: string) {
    await this.descriptionInput.fill(description);
  }

  /** Select a category by name */
  async selectCategory(category: string) {
    await this.page.getByRole('button', { name: new RegExp(category, 'i') }).click();
  }

  /** Select a frequency by label text */
  async selectFrequency(label: RegExp) {
    await this.page.getByRole('button', { name: label }).click();
  }

  /** Click the Create / submit button */
  async submit() {
    await this.page.getByRole('button', { name: /create/i }).click();
  }

  /** Submit and wait for the API response (use for valid submissions only) */
  async submitAndWaitForApi() {
    await Promise.all([
      this.page.waitForResponse(
        (res) => res.url().includes('/api/habits') && res.request().method() === 'POST',
        { timeout: 15000 },
      ),
      this.page.getByRole('button', { name: /create/i }).click(),
    ]);
  }

  /** Click the Cancel button */
  async cancel() {
    await this.page.getByRole('button', { name: /cancel/i }).click();
  }

  /** Wait for redirect to habits list after successful creation */
  async waitForRedirect() {
    // Use regex to match /habits with any query params, and wait for either
    // a habit card or the heading — whichever appears first confirms the page loaded.
    await this.page.waitForURL(/\/habits(?:\?|$)/, { timeout: 15000 });
    await this.page
      .locator('[data-testid^="habit-card"], h1, [data-testid="empty-state"]')
      .first()
      .waitFor({ timeout: 10000 });
  }

  /** Validation error message */
  get validationError() {
    return this.page.locator('[data-slot="form-message"]');
  }

  /** Submit (Create) button locator */
  get submitButton() {
    return this.page.getByRole('button', { name: /create/i });
  }
}
