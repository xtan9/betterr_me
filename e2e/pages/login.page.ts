import type { Page } from '@playwright/test';

export class LoginPage {
  constructor(private page: Page) {}

  async goto() {
    await this.page.goto('/auth/login');
    await this.page.waitForLoadState('networkidle');
  }

  /** Email input field */
  get emailInput() {
    return this.page.getByLabel(/email/i);
  }

  /** Password input field */
  get passwordInput() {
    return this.page.getByLabel(/password/i);
  }

  /** Fill email */
  async fillEmail(email: string) {
    await this.emailInput.fill(email);
  }

  /** Fill password */
  async fillPassword(password: string) {
    await this.passwordInput.fill(password);
  }

  /** Click the submit/login button */
  async submit() {
    await this.page.getByRole('button', { name: /log\s*in|sign\s*in/i }).click();
  }
}
