import type { Page } from '@playwright/test';

export class CreateHabitPage {
  constructor(private page: Page) {}

  async goto() {
    await this.page.goto('/habits/new');
    await this.page.waitForLoadState('networkidle');
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

  /** Click the Cancel button */
  async cancel() {
    await this.page.getByRole('button', { name: /cancel/i }).click();
  }

  /** Wait for redirect to habits list after successful creation */
  async waitForRedirect() {
    await this.page.waitForURL('/habits', { timeout: 10000 });
  }

  /** Validation error message */
  get validationError() {
    return this.page.getByText(/name.*required/i);
  }

  /** Submit (Create) button locator */
  get submitButton() {
    return this.page.getByRole('button', { name: /create/i });
  }
}
