import { Page, Locator } from '@playwright/test';

/**
 * Page object for the 账号 (accounts) tab at `/zh/users` — Plan B Task 9's
 * status badge / phone / online / force-offline / status toggle / batch bar /
 * role select / impersonation-driven tenant scope. Mirrors `users.page.ts`
 * and `tenants.page.ts` conventions but is built around the REAL data-testid
 * set added by Task 9 (see `src/app/[locale]/(dashboard)/users/page.tsx`)
 * rather than icon/class selectors, since almost every interactive element
 * on this tab now carries a stable testid.
 */
export class AccountTabPage {
  readonly page: Page;
  readonly accountsTab: Locator;
  readonly createButton: Locator;
  readonly table: Locator;
  readonly dialog: Locator;
  readonly confirmDialog: Locator;
  readonly searchInput: Locator;
  readonly batchBar: Locator;

  constructor(page: Page) {
    this.page = page;
    this.accountsTab = page.getByTestId('users-tab-accounts');
    // GT-12312 renamed the PageHeader action 创建用户 → 新建 (prototype
    // alignment); exact match keeps row-level buttons out of scope.
    this.createButton = page.getByRole('button', { name: '新建', exact: true });
    this.table = page.locator('.rounded-md.border table, table').first();
    this.dialog = page.getByTestId('create-user-dialog');
    this.confirmDialog = page.locator('[role="alertdialog"]');
    this.searchInput = page.getByTestId('user-search');
    this.batchBar = page.getByTestId('batch-bar');
  }

  async goto() {
    await this.page.goto('/zh/users');
  }

  async expectLoaded() {
    await this.accountsTab.waitFor({ state: 'visible' });
    await this.accountsTab.click();
    await this.table.waitFor({ state: 'visible' });
  }

  async columnHeaders(): Promise<string[]> {
    return (await this.page.getByRole('columnheader').allTextContents()).map((h) => h.trim());
  }

  // ─── Create dialog ─────────────────────────────────────────────────────

  async openCreateDialog() {
    await this.createButton.click();
    await this.dialog.waitFor({ state: 'visible' });
  }

  /**
   * Fills the create-admin form. `roleName` is matched against the seeded
   * role list (`internal/api/roles.go` / `configs/postgres/init.sql`, e.g.
   * 系统管理员/平台审计员/安全运营/审计员) rendered as `[data-slot="select-item"]`
   * text inside the `new-admin-role-select` trigger's portal content.
   */
  async fillCreateForm(data: {
    username: string;
    password: string;
    name?: string;
    phone?: string;
    email?: string;
    roleName: string;
  }) {
    const dialog = this.dialog;
    await dialog.locator('input[name="username"]').fill(data.username);
    await dialog.locator('input[name="password"]').fill(data.password);
    if (data.name) {
      await dialog.locator('input[name="name"]').fill(data.name);
    }
    if (data.phone) {
      await dialog.getByTestId('new-admin-phone').fill(data.phone);
    }
    if (data.email) {
      await dialog.locator('input[name="email"]').fill(data.email);
    }
    await this.selectRole(data.roleName);
  }

  async selectRole(roleName: string) {
    await this.dialog.getByTestId('new-admin-role-select').click();
    await this.page.waitForTimeout(300);
    await this.page.locator('[data-slot="select-item"]').filter({ hasText: roleName }).first().click();
  }

  async submitForm() {
    await this.dialog.locator('button[type="submit"]').click();
    await this.dialog.waitFor({ state: 'hidden' });
  }

  async createUser(data: Parameters<AccountTabPage['fillCreateForm']>[0]) {
    await this.openCreateDialog();
    await this.fillCreateForm(data);
    await this.submitForm();
  }

  // ─── Row lookup ────────────────────────────────────────────────────────

  findRowByUsername(username: string): Locator {
    return this.table.locator('tbody tr').filter({ hasText: username }).first();
  }

  async search(username: string) {
    await this.searchInput.fill(username);
    await this.page.waitForTimeout(400);
  }

  /** Reads the numeric id off a row's `data-testid="user-row-<id>"`. */
  async rowId(row: Locator): Promise<number> {
    const testId = await row.getAttribute('data-testid');
    if (!testId) throw new Error('row has no data-testid');
    const id = Number(testId.replace('user-row-', ''));
    if (Number.isNaN(id)) throw new Error(`unexpected row testid: ${testId}`);
    return id;
  }

  async findUserRowId(username: string): Promise<number> {
    await this.search(username);
    const row = this.findRowByUsername(username);
    await row.waitFor({ state: 'visible' });
    return this.rowId(row);
  }

  // ─── Row actions ───────────────────────────────────────────────────────

  statusBadge(id: number): Locator {
    return this.page.getByTestId(`user-status-badge-${id}`);
  }

  onlineIndicator(id: number): Locator {
    return this.page.getByTestId(`user-online-${id}`);
  }

  rowCheckbox(id: number): Locator {
    return this.page.getByTestId(`user-row-checkbox-${id}`);
  }

  /** Disables an enabled account: click toggle-status, then confirm. */
  async disableUser(id: number) {
    await this.page.getByTestId(`toggle-status-${id}`).click();
    await this.confirmDialog.waitFor({ state: 'visible' });
    await this.confirmDialog.getByRole('button', { name: '确认' }).click();
    await this.confirmDialog.waitFor({ state: 'hidden' });
  }

  /** Re-enables a disabled account: toggle-status fires immediately, no confirm. */
  async enableUser(id: number) {
    await this.page.getByTestId(`toggle-status-${id}`).click();
  }

  async forceOffline(id: number) {
    await this.page.getByTestId(`force-offline-${id}`).click();
    await this.confirmDialog.waitFor({ state: 'visible' });
    await this.confirmDialog.getByRole('button', { name: '确认' }).click();
    await this.confirmDialog.waitFor({ state: 'hidden' });
  }

  // ─── Batch bar ─────────────────────────────────────────────────────────

  async selectRows(ids: number[]) {
    for (const id of ids) {
      await this.rowCheckbox(id).check();
    }
    await this.batchBar.waitFor({ state: 'visible' });
  }

  async batchDisable() {
    await this.page.getByTestId('batch-disable').click();
    await this.confirmDialog.waitFor({ state: 'visible' });
    await this.confirmDialog.getByRole('button', { name: '确认' }).click();
    await this.confirmDialog.waitFor({ state: 'hidden' });
  }

  async batchEnable() {
    await this.page.getByTestId('batch-enable').click();
    await this.confirmDialog.waitFor({ state: 'visible' });
    await this.confirmDialog.getByRole('button', { name: '确认' }).click();
    await this.confirmDialog.waitFor({ state: 'hidden' });
  }
}
