import { Page, Locator } from '@playwright/test';

export type PermAction = 'view' | 'edit' | 'approve' | 'delete';

/**
 * Page object for the 角色权限 (role-permission) tab at `/zh/users` (Plan C
 * Task 7's `RolePermissionTab` + `RoleDrawer`, Plan C Task 9's E2E). Built
 * around the real data-testid set:
 *  - `users-tab-roles` (the tab trigger, `users/page.tsx`)
 *  - `create-role` / `role-search` / `role-row-<id>` / `role-status-toggle-<id>`
 *    (`RolePermissionTab.tsx`)
 *  - `role-drawer` / `role-name-input` / `role-remark-input` / `role-save` /
 *    `role-perm-<roleIdToken>-<submoduleId>-visible` /
 *    `role-perm-<roleIdToken>-<submoduleId>-<view|edit|approve|delete>`
 *    (`RoleDrawer.tsx`; `roleIdToken` is the literal string `new` in create
 *    mode, or the role's numeric id in edit/view mode)
 */
export class RolePermissionPage {
  readonly page: Page;
  readonly rolesTab: Locator;
  readonly createButton: Locator;
  readonly table: Locator;
  readonly drawer: Locator;
  readonly searchInput: Locator;

  constructor(page: Page) {
    this.page = page;
    this.rolesTab = page.getByTestId('users-tab-roles');
    this.createButton = page.getByTestId('create-role');
    this.table = page.locator('.rounded-md.border table, table').first();
    this.drawer = page.getByTestId('role-drawer');
    this.searchInput = page.getByTestId('role-search');
  }

  async goto() {
    await this.page.goto('/zh/users');
  }

  /** Navigate to /users and switch to the 角色权限 tab. */
  async expectLoaded() {
    await this.rolesTab.waitFor({ state: 'visible' });
    await this.rolesTab.click();
    await this.table.waitFor({ state: 'visible' });
  }

  async search(name: string) {
    await this.searchInput.fill(name);
    await this.page.waitForTimeout(400);
  }

  findRowByName(name: string): Locator {
    return this.table.locator('tbody tr').filter({ hasText: name }).first();
  }

  /** Reads the numeric id off a row's `data-testid="role-row-<id>"`. */
  async rowId(row: Locator): Promise<number> {
    const testId = await row.getAttribute('data-testid');
    if (!testId) throw new Error('row has no data-testid');
    const id = Number(testId.replace('role-row-', ''));
    if (Number.isNaN(id)) throw new Error(`unexpected row testid: ${testId}`);
    return id;
  }

  async findRoleRowId(name: string): Promise<number> {
    await this.search(name);
    const row = this.findRowByName(name);
    await row.waitFor({ state: 'visible' });
    return this.rowId(row);
  }

  // ─── Drawer open/close ─────────────────────────────────────────────────

  async openCreateDrawer() {
    await this.createButton.click();
    await this.drawer.waitFor({ state: 'visible' });
  }

  /** Opens a row's drawer via its 编辑/查看 row action (whichever is rendered). */
  async openRoleDrawer(name: string) {
    await this.search(name);
    const row = this.findRowByName(name);
    await row.getByRole('button', { name: /编辑|查看/ }).click();
    await this.drawer.waitFor({ state: 'visible' });
  }

  async closeDrawer() {
    await this.drawer.getByRole('button', { name: /关闭|取消/ }).click();
    await this.drawer.waitFor({ state: 'hidden' });
  }

  // ─── Drawer fields ─────────────────────────────────────────────────────

  get nameInput(): Locator {
    return this.page.getByTestId('role-name-input');
  }

  get remarkInput(): Locator {
    return this.page.getByTestId('role-remark-input');
  }

  get saveButton(): Locator {
    return this.page.getByTestId('role-save');
  }

  async fillName(name: string) {
    await this.nameInput.fill(name);
  }

  async save() {
    await this.saveButton.click();
    await this.drawer.waitFor({ state: 'hidden' });
  }

  /** The module-visible checkbox for a submodule row. */
  visibleCheckbox(roleIdToken: string | number, subId: string): Locator {
    return this.page.getByTestId(`role-perm-${roleIdToken}-${subId}-visible`);
  }

  /** The action-matrix cell for a submodule row (checkbox when supported, static "-" text otherwise). */
  actionCell(roleIdToken: string | number, subId: string, action: PermAction): Locator {
    return this.page.getByTestId(`role-perm-${roleIdToken}-${subId}-${action}`);
  }

  // ─── Row actions ───────────────────────────────────────────────────────

  statusToggle(id: number): Locator {
    return this.page.getByTestId(`role-status-toggle-${id}`);
  }
}
