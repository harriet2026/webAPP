import { Page, Locator } from '@playwright/test';

export class SMTPCredentialsPage {
  readonly page: Page;
  readonly heading: Locator;
  readonly createButton: Locator;
  readonly table: Locator;
  readonly dialog: Locator;
  readonly confirmDialog: Locator;

  constructor(page: Page) {
    this.page = page;
    this.heading = page.locator('main h1');
    this.createButton = page.locator('main button:has(svg.lucide-plus)');
    this.table = page.locator('.rounded-md.border table, table').first();
    this.dialog = page.locator('[role="dialog"]');
    this.confirmDialog = page.locator('[role="alertdialog"]');
  }

  async search(text: string) {
    const input = this.page.getByPlaceholder(/用户名|username/i).first();
    await input.clear();
    await input.fill(text);
    await this.page.waitForFunction(
      (q) => document.querySelectorAll('table tbody tr').length > 0,
      text,
      { timeout: 5000 }
    ).catch(() => {});
  }

  async clearSearch() {
    const input = this.page.getByPlaceholder(/用户名|username/i).first();
    await input.clear();
    await this.page.waitForTimeout(300);
  }

  async goto() {
    await this.page.goto('/zh/smtp-credentials');
  }

  async expectLoaded() {
    await this.heading.waitFor({ state: 'visible' });
  }

  async openCreateDialog() {
    await this.createButton.first().click();
    await this.dialog.waitFor({ state: 'visible' });
  }

  async fillCreateForm(data: {
    username: string;
    password: string;
    tenantId: number;
    authBackend?: string;
    backendConfig?: string;
  }) {
    const dialog = this.dialog;
    await dialog.locator('input[name="username"]').fill(data.username);
    await dialog.locator('input[name="password"]').fill(data.password);
    const tenantInput = dialog.locator('input[name="tenant_id"]');
    await tenantInput.click();
    await tenantInput.clear();
    await tenantInput.pressSequentially(String(data.tenantId));

    if (data.authBackend && data.authBackend !== 'local') {
      await dialog.locator('[data-slot="select-trigger"]').click();
      await this.page.waitForTimeout(500);
      const item = this.page.locator('[data-slot="select-item"]').filter({ hasText: data.authBackend === 'smtp_relay' ? 'smtp_relay' : 'ldap' });
      await item.click();
      if (data.backendConfig) {
        await dialog.locator('input[name="backend_config"]').fill(data.backendConfig);
      }
    }
  }

  async submitForm() {
    const responsePromise = this.page.waitForResponse(
      (resp) => resp.url().includes('/smtp-credentials'),
      { timeout: 10000 }
    ).catch(() => null);
    await this.dialog.locator('button[type="submit"]').click();
    const resp = await responsePromise;
    try {
      await this.dialog.waitFor({ state: 'hidden', timeout: 10000 });
    } catch {
      const errorText = await this.page.locator('[data-sonner-toast], .text-red-500, .text-destructive, [role="alert"]').first().textContent().catch(() => '');
      if (errorText) {
        throw new Error(`Form submission failed: ${errorText}`);
      }
      const respStatus = resp ? resp.status() : 'no response';
      throw new Error(`Dialog did not close after form submission (response status: ${respStatus})`);
    }
  }

  async createCredential(data: Parameters<SMTPCredentialsPage['fillCreateForm']>[0]) {
    await this.openCreateDialog();
    await this.fillCreateForm(data);
    await this.submitForm();
  }

  findRowByUsername(username: string): Locator {
    return this.table.locator('tbody tr').filter({ hasText: username }).first();
  }

  async openEditDialog(username: string) {
    const row = this.findRowByUsername(username);
    await row.locator('button:has(svg.lucide-pencil)').click();
    await this.dialog.waitFor({ state: 'visible' });
  }

  async fillEditForm(data: { username?: string }) {
    const dialog = this.dialog;
    if (data.username) {
      await dialog.locator('input[name="username"]').fill(data.username);
    }
  }

  async submitEditForm() {
    await this.dialog.locator('button[type="submit"]').click();
    await this.dialog.waitFor({ state: 'hidden' });
  }

  async deleteCredential(username: string) {
    const row = this.findRowByUsername(username);
    await row.locator('button:has(svg.lucide-trash-2)').click();
    await this.confirmDialog.waitFor({ state: 'visible' });
    await this.confirmDialog.locator('button').last().click();
    await this.confirmDialog.waitFor({ state: 'hidden' });
  }

  async openResetPasswordDialog(username: string) {
    const row = this.findRowByUsername(username);
    await row.locator('button:has(svg.lucide-key)').click();
    await this.dialog.waitFor({ state: 'visible' });
  }

  async fillResetPassword(password: string) {
    await this.dialog.locator('input[type="password"]').fill(password);
  }

  async submitResetPassword() {
    await this.dialog.locator('button').last().click();
    await this.dialog.waitFor({ state: 'hidden' });
  }

  async expectCredentialInTable(username: string) {
    const row = this.findRowByUsername(username);
    await row.waitFor({ state: 'visible' });
  }

  async getRowCount() {
    return await this.table.locator('tbody tr').count();
  }
}
