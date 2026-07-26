import { Page, Locator } from '@playwright/test';

/**
 * Page object for the Spec 2A tenant-management UI at `/zh/tenants`.
 *
 * The rewritten UI (Task 5) replaces the old Dialog+delete flow with:
 *   - a Sheet drawer (still `[role="dialog"]`) for create/edit, where `code`
 *     is required on create and read-only on edit;
 *   - status toggle (suspend/activate) via row action + AlertDialog confirm;
 *   - no delete button (cleanup is via the API).
 */
export class TenantsPage {
  readonly page: Page;
  readonly heading: Locator;
  readonly createButton: Locator;
  readonly table: Locator;
  readonly searchInput: Locator;
  readonly statusFilter: Locator;
  readonly drawer: Locator;
  readonly confirmDialog: Locator;

  constructor(page: Page) {
    this.page = page;
    this.heading = page.locator('main h1');
    // The PageHeader "创建租户" button is the primary create affordance. Use
    // role+name so the selector survives icon-only tweaks.
    this.createButton = page.getByRole('button', { name: '创建租户' }).first();
    this.table = page.locator('table').first();
    this.searchInput = page.getByPlaceholder('租户名称').first();
    this.statusFilter = page.getByRole('combobox').first();
    this.drawer = page.locator('[role="dialog"]');
    this.confirmDialog = page.locator('[role="alertdialog"]');
  }

  async goto() {
    await this.page.goto('/zh/tenants');
  }

  async expectLoaded() {
    await this.heading.waitFor({ state: 'visible' });
    await this.table.waitFor({ state: 'visible' });
  }

  /** Locates the 4 stat cards block ( TenantStatsCards ). */
  statsGrid(): Locator {
    // The stats grid is the first `.grid.grid-cols-1.sm:grid-cols-2.lg:grid-cols-4`
    // rendered above the list. The cards themselves are wrapped in <div> by Card.
    return this.page.locator('div.grid.grid-cols-1').first();
  }

  // ─── Search / filter ──────────────────────────────────────────────────

  async search(searchText: string) {
    await this.table.waitFor({ state: 'visible' });
    await this.searchInput.waitFor({ state: 'visible' });
    await this.searchInput.fill(searchText);
    await this.searchInput.press('Enter');
    // Wait for the spinner -> rows to settle. The first row may be empty in
    // which case waitForTableLoad below will time out; rely on network idle.
    await this.page.waitForLoadState('networkidle');
  }

  async resetSearch() {
    // "X" reset button in the toolbar (ghost icon button with lucide-x)
    const resetBtn = this.page.locator('main button:has(svg.lucide-x)').first();
    await resetBtn.click();
    await this.page.waitForLoadState('networkidle');
  }

  // ─── Create / Edit drawer (Sheet) ─────────────────────────────────────

  async openCreateDrawer() {
    await this.createButton.click();
    await this.drawer.waitFor({ state: 'visible' });
  }

  /**
   * Fill the create drawer. `name` and `code` are required by Spec 2A; other
   * fields are optional and only set when provided.
   */
  async fillCreateForm(data: {
    name: string;
    code: string;
    expireAt?: string; // YYYY-MM-DD
    capabilities?: string[]; // feature ids whose checkbox should be checked
    domains?: string[]; // ≥1 required by Spec 2A §5; add a row per entry
  }) {
    const drawer = this.drawer;
    await drawer.locator('input[name="name"]').fill(data.name);
    await drawer.locator('input[name="code"]').fill(data.code);
    if (data.expireAt) {
      await drawer.locator('input[name="expire_at"]').fill(data.expireAt);
    }
    // Domain registration: the schema requires at least one domain, so add a
    // row (via the 添加域名 button) and fill it for each requested domain.
    const domains = data.domains ?? [];
    for (let i = 0; i < domains.length; i++) {
      await drawer.getByRole('button', { name: '添加域名' }).click();
      await drawer.locator(`input[name="domains.${i}.domain"]`).fill(domains[i]);
    }
    for (const capId of data.capabilities ?? []) {
      const box = drawer.locator(`#cap-${capId}`);
      if (!(await box.isChecked())) {
        await box.check();
      }
    }
  }

  /**
   * Fill the edit drawer. `code` is read-only on edit (disabled) so this only
   * updates the mutable fields.
   */
  async fillEditForm(data: {
    name?: string;
    expireAt?: string;
    capabilities?: string[];
  }) {
    const drawer = this.drawer;
    if (data.name !== undefined) {
      await drawer.locator('input[name="name"]').fill(data.name);
    }
    if (data.expireAt) {
      await drawer.locator('input[name="expire_at"]').fill(data.expireAt);
    }
    for (const capId of data.capabilities ?? []) {
      const box = drawer.locator(`#cap-${capId}`);
      if (!(await box.isChecked())) {
        await box.check();
      }
    }
  }

  /** Code field is disabled when editing; asserts the read-only contract. */
  async expectCodeReadOnly() {
    const codeInput = this.drawer.locator('input[name="code"]');
    await codeInput.waitFor({ state: 'visible' });
    if (!(await codeInput.isDisabled())) {
      throw new Error('Expected code input to be disabled in edit drawer');
    }
  }

  async submitDrawer() {
    // Sheet footer Save button (type=submit)
    await this.drawer.locator('button[type="submit"]').click();
    await this.drawer.waitFor({ state: 'hidden' });
  }

  // ─── Row helpers ──────────────────────────────────────────────────────

  findRowByName(name: string): Locator {
    return this.table.locator('tbody tr').filter({ hasText: name }).first();
  }

  findRowByCode(code: string): Locator {
    return this.table.locator('tbody tr').filter({ hasText: code }).first();
  }

  /**
   * Locate a row by name with retry: reload + search so the row is in the
   * current page window even when many tenants exist.
   */
  async navigateToRow(name: string): Promise<Locator> {
    await this.page.reload();
    await this.expectLoaded();
    await this.search(name);
    const row = this.findRowByName(name);
    if (await row.isVisible().catch(() => false)) return row;
    await this.resetSearch();
    await this.page.waitForLoadState('networkidle');
    return this.findRowByName(name);
  }

  async openEditDrawer(name: string) {
    const row = await this.navigateToRow(name);
    await row.locator('button:has(svg.lucide-pencil)').click();
    await this.drawer.waitFor({ state: 'visible' });
  }

  /**
   * Click the suspend (Ban icon) row action and confirm via AlertDialog.
   * Located by the button's `title` (zh "暂停") since lucide class names
   * shift between versions. No-op if the tenant is already suspended.
   */
  async suspend(name: string) {
    const row = await this.navigateToRow(name);
    await row.locator('button[title="暂停"]').click();
    await this.confirmDialog.waitFor({ state: 'visible' });
    await this.confirmDialog.locator('button').last().click();
    await this.confirmDialog.waitFor({ state: 'hidden' });
  }

  /** Click the activate (CheckCircle2 icon) row action and confirm. */
  async activate(name: string) {
    const row = await this.navigateToRow(name);
    await row.locator('button[title="启用"]').click();
    await this.confirmDialog.waitFor({ state: 'visible' });
    await this.confirmDialog.locator('button').last().click();
    await this.confirmDialog.waitFor({ state: 'hidden' });
  }

  async expectTenantInTable(name: string) {
    const row = await this.navigateToRow(name);
    await row.waitFor({ state: 'visible' });
  }

  async getRowCount() {
    return await this.table.locator('tbody tr').count();
  }
}

/**
 * Page object for the tenant-domains sub-page. Kept for specs that exercise
 * domain CRUD; the structure here matches the Spec 2A+ Task 8 layout (verify
 * column).
 */
export class TenantDomainsPage {
  readonly page: Page;
  readonly heading: Locator;
  readonly backButton: Locator;
  readonly table: Locator;
  readonly drawer: Locator;
  readonly confirmDialog: Locator;
  readonly createButton: Locator;

  constructor(page: Page) {
    this.page = page;
    this.heading = page.locator('main h1');
    this.backButton = page.locator('button:has(svg.lucide-arrow-left)');
    this.table = page.locator('table').first();
    this.drawer = page.locator('[role="dialog"]');
    this.confirmDialog = page.locator('[role="alertdialog"]');
    this.createButton = page.locator('button:has(svg.lucide-plus)');
  }

  async goto(tenantId: number) {
    await this.page.goto(`/zh/tenants/${tenantId}/domains`);
  }

  async expectLoaded() {
    await this.heading.waitFor({ state: 'visible' });
  }

  async goBack() {
    await this.backButton.click();
  }
}
