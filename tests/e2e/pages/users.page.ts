import { Page, Locator } from '@playwright/test';

export class UsersPage {
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
    // 精确锁定业务对话框：裸 [role="dialog"] 在 dev server 下会撞上
    // Next.js dev-tools 的 issues overlay（同样是 role=dialog），触发
    // strict mode violation。
    this.dialog = page.getByTestId('create-user-dialog');
    this.confirmDialog = page.locator('[role="alertdialog"]');
  }

  async goto() {
    await this.page.goto('/zh/users');
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
    role?: string;
    tenantId?: number;
  }) {
    const dialog = this.dialog;
    await dialog.locator('input[name="username"]').fill(data.username);
    await dialog.locator('input[name="password"]').fill(data.password);

    // Role is now chosen from a NAMED role list (RBAC rework): the options are
    // roles like 系统管理员 / 安全运营, not the legacy 'system_admin' string, and
    // the field is `role_id`. Also, the 租户 input only renders once a
    // TENANT-scoped role is selected (`!isTenantView && selectedRole?.scope ===
    // 'tenant'` in users/page.tsx), so the role must be picked BEFORE filling it.
    // This used to skip the select entirely for 'tenant_admin' and then fill a
    // tenant_id input that consequently never existed.
    if (data.role) {
      const optionText = data.role === 'tenant_admin' ? '安全运营' : '系统管理员';
      await dialog.getByTestId('new-admin-role-select').click();
      const item = this.page.getByRole('option', { name: optionText }).first();
      await item.waitFor({ state: 'visible', timeout: 5000 });
      await item.click();
    }

    if (data.tenantId !== undefined) {
      const tenantInput = dialog.locator('input[name="tenant_id"]');
      await tenantInput.waitFor({ state: 'visible', timeout: 5000 });
      await tenantInput.fill(String(data.tenantId));
    }
  }

  async fillEditForm(data: {
    username?: string;
    password?: string;
    role?: string;
    tenantId?: number;
  }) {
    const dialog = this.dialog;
    if (data.username) {
      await dialog.locator('input[name="username"]').fill(data.username);
    }
    if (data.password) {
      await dialog.locator('input[type="password"]').fill(data.password);
    }
    // Same named-role list as the create form (see fillCreateForm): options are
    // 系统管理员 / 安全运营, not the legacy role strings, and 租户 only renders once
    // a tenant-scoped role is selected. No caller exercises this branch today, so
    // it was silently stale — fixed alongside its create-form twin rather than
    // left as a trap.
    if (data.role) {
      const optionText = data.role === 'tenant_admin' ? '安全运营' : '系统管理员';
      await dialog.getByTestId('new-admin-role-select').click();
      const item = this.page.getByRole('option', { name: optionText }).first();
      await item.waitFor({ state: 'visible', timeout: 5000 });
      await item.click();
    }
    if (data.tenantId !== undefined) {
      const tenantInput = dialog.locator('input[name="tenant_id"]');
      await tenantInput.waitFor({ state: 'visible', timeout: 5000 });
      await tenantInput.fill(String(data.tenantId));
    }
  }

  async submitForm() {
    await this.dialog.locator('button[type="submit"]').click();
    await this.dialog.waitFor({ state: 'hidden' });
  }

  async createUser(data: Parameters<UsersPage['fillCreateForm']>[0]) {
    await this.openCreateDialog();
    await this.fillCreateForm(data);
    await this.submitForm();
  }

  findRowByUsername(username: string): Locator {
    return this.table.locator('tbody tr').filter({ hasText: username }).first();
  }

  async openEditDialog(username: string) {
    await this.page.getByPlaceholder(/搜索用户名|Search username/).fill(username);
    await this.page.waitForTimeout(500);
    const row = this.findRowByUsername(username);
    await row.locator('button:has(svg.lucide-pencil)').click();
    await this.dialog.waitFor({ state: 'visible' });
  }

  async deleteUser(username: string) {
    await this.page.getByPlaceholder(/搜索用户名|Search username/).fill(username);
    await this.page.waitForTimeout(500);
    const row = this.findRowByUsername(username);
    await row.locator('button:has(svg.lucide-trash-2)').click();
    await this.confirmDialog.waitFor({ state: 'visible' });
    await this.confirmDialog.locator('button').last().click();
    await this.confirmDialog.waitFor({ state: 'hidden' });
  }

  async expectUserInTable(username: string) {
    await this.page.getByPlaceholder(/搜索用户名|Search username/).fill(username);
    await this.page.waitForTimeout(500);
    const row = this.findRowByUsername(username);
    await row.waitFor({ state: 'visible' });
  }

  async getRowCount() {
    return await this.table.locator('tbody tr').count();
  }
}
