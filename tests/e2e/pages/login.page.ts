import { Page, Locator } from '@playwright/test';
import { expect } from '@playwright/test';

export class LoginPage {
  readonly page: Page;
  readonly usernameInput: Locator;
  readonly passwordInput: Locator;
  readonly submitButton: Locator;
  readonly errorMessage: Locator;

  constructor(page: Page) {
    this.page = page;
    this.usernameInput = page.locator('input[name="username"]');
    this.passwordInput = page.locator('input[name="password"]');
    this.submitButton = page.locator('button[type="submit"]');
    this.errorMessage = page.locator('.text-destructive');
  }

  async goto() {
    await this.page.goto('/zh/login');
  }

  async login(username: string, password: string) {
    await this.usernameInput.fill(username);
    await this.passwordInput.fill(password);
    await this.submitButton.click();
  }

  async expectError(text?: string) {
    const errorEl = this.page.locator('.text-destructive, [data-testid="login-error"], .text-sm.text-destructive').first();
    await errorEl.waitFor({ state: 'visible', timeout: 10000 });
    if (text) {
      await this.page.locator(`:text("${text}")`).first().waitFor({ state: 'visible' });
    }
  }

  async expectRedirect() {
    await expect(this.page).toHaveURL(/dashboard/, { timeout: 15000 });
  }
}
