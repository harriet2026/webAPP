import { Page, Locator, expect } from '@playwright/test';

export class RBLFilterPage {
  readonly page: Page;
  readonly heading: Locator;
  readonly serverTable: Locator;
  readonly hitRulesTable: Locator;
  readonly addServerInput: Locator;
  readonly addServerButton: Locator;
  readonly createRuleButton: Locator;
  readonly searchInput: Locator;
  readonly probeIPInput: Locator;
  readonly probeButton: Locator;

  constructor(page: Page) {
    this.page = page;
    this.heading = page.locator('main h1');
    this.serverTable = page.locator('.rounded-md.border table, table').first();
    this.hitRulesTable = page.locator('.rounded-md.border table, table').nth(1);
    this.addServerInput = page.getByPlaceholder('rbl.example.com').first();
    this.addServerButton = page.locator('main button').filter({ hasText: /Add Server|添加服务器|添加服务器/ }).first();
    this.createRuleButton = page.locator('main button').filter({ hasText: /Create Rule|新建规则|创建规则/ }).first();
    this.searchInput = page.locator('main input[placeholder]').filter({ hasText: '' }).nth(1);
    this.probeIPInput = page.locator('main input[placeholder]').filter({ hasText: '' }).nth(0);
    this.probeButton = page.locator('main button').filter({ hasText: /Query|查询/ }).first();
  }

  /**
   * Navigate to the module and select it. Delegates to the pair below so there
   * is ONE definition of where this module lives — this used to carry its own
   * copy of the old /security/pipeline path plus a silent `if (count > 0)`
   * no-op, which would have quietly resurrected the stale behaviour for any
   * future caller.
   */
  async goto() {
    await this.gotoDirect();
    await this.openRBLCard();
  }

  // RBL 过滤 is a connection-layer (stage-1) policy. Stage 1 is platform-managed:
  // the tenant pipeline omits those cards ("「阶段1：IP策略」由平台统一管控") and a
  // platform admin gets no pipeline cards at all (Module A is tenant-only,
  // GT-12149), so /security/pipeline reaches this module for no role. It lives on
  // the platform-security page's connection layer
  // (ConnectionLayerPanel -> <RBLFilterPage embedded />).
  async gotoDirect() {
    await this.page.goto('/zh/system/platform-security');
    await this.page.waitForLoadState('networkidle');
  }

  async expectLoaded() {
    const pageContent = this.page.locator('main');
    await pageContent.waitFor({ state: 'visible' });
  }

  // Select the RBL module in the connection-layer nav.
  //
  // This used to hunt for `[class*="cursor-pointer"]` containing "RBL" and, when
  // it found nothing, silently do NOTHING (`if (count > 0)`). So once the module
  // moved, this no-opped and the failure surfaced 30s later as a missing combobox
  // somewhere else, pointing away from the real cause. Assert instead.
  async openRBLCard() {
    const moduleBtn = this.page.getByRole('button', { name: /RBL/i }).first();
    await expect(moduleBtn).toBeVisible({ timeout: 10000 });
    await moduleBtn.click();
    await expect(this.page.getByTestId('module-master-switch-rbl_filter')).toBeVisible({ timeout: 10000 });
  }

  getServerTableElement() {
    return this.page.locator('table').first();
  }

  getHitRulesTableElement() {
    return this.page.locator('table').nth(1);
  }

  async getServerTableHeaders(): Promise<string[]> {
    const table = this.getServerTableElement();
    const headers = table.locator('thead th');
    const count = await headers.count();
    const texts: string[] = [];
    for (let i = 0; i < count; i++) {
      texts.push(await headers.nth(i).innerText());
    }
    return texts;
  }

  async getHitRulesTableHeaders(): Promise<string[]> {
    const table = this.getHitRulesTableElement();
    const headers = table.locator('thead th');
    const count = await headers.count();
    const texts: string[] = [];
    for (let i = 0; i < count; i++) {
      texts.push(await headers.nth(i).innerText());
    }
    return texts;
  }

  async addServer(domain: string) {
    // Target the RBL server input by its specific placeholder — a bare
    // input[placeholder].first() can select a different input (probe IP / search)
    // that precedes it, leaving newServer empty so the add button stays
    // disabled={!newServer.trim()} and the click times out.
    const input = this.page.getByPlaceholder('rbl.example.com').first();
    await input.waitFor({ state: 'visible', timeout: 10000 }).catch(() => {});
    if (await input.count() === 0) return;
    await input.fill(domain);
    // Submit via Enter (component onKeyDown triggers addServer when the value is
    // non-empty). The adjacent add button can be overlapped by the card <section>
    // in the built layout, so a click gets pointer-intercepted; Enter is robust and
    // user-realistic.
    await input.press('Enter');
    await this.page.waitForTimeout(500);
  }

  async deleteServer(name: string) {
    const rows = this.getServerTableElement().locator('tbody tr');
    const count = await rows.count();
    for (let i = 0; i < count; i++) {
      const text = await rows.nth(i).innerText();
      if (text.includes(name)) {
        const deleteBtn = rows.nth(i).locator('button').filter({ hasText: '' }).last();
        const trashBtn = rows.nth(i).locator('button.text-destructive, button[class*="destructive"]').first();
        if (await trashBtn.count() > 0) {
          await trashBtn.click();
          await this.page.waitForTimeout(500);
          const confirmBtn = this.page.locator('[role="alertdialog"] button, [role="dialog"] button').filter({ hasText: /Confirm|确认|确定|Yes/ }).first();
          if (await confirmBtn.count() > 0) {
            await confirmBtn.click();
            await this.page.waitForTimeout(500);
          }
        }
        break;
      }
    }
  }

  async searchRules(query: string) {
    const inputs = this.page.locator('main input[placeholder]');
    const count = await inputs.count();
    for (let i = 0; i < count; i++) {
      const placeholder = await inputs.nth(i).getAttribute('placeholder') || '';
      if (placeholder.includes('Search') || placeholder.includes('搜索') || placeholder.includes('过滤') || placeholder.includes('Filter')) {
        await inputs.nth(i).fill(query);
        await this.page.waitForTimeout(500);
        return;
      }
    }
  }

  async clickCreateRule() {
    const btn = this.page.locator('main button').filter({ hasText: /Create Rule|新建规则|创建规则/ }).first();
    if (await btn.count() > 0) {
      await btn.click();
      await this.page.waitForTimeout(500);
    }
  }

  async probeIP(ip: string) {
    const inputs = this.page.locator('main input[placeholder]');
    const count = await inputs.count();
    for (let i = 0; i < count; i++) {
      const placeholder = await inputs.nth(i).getAttribute('placeholder') || '';
      if (placeholder.includes('IP') || placeholder.includes('地址')) {
        await inputs.nth(i).fill(ip);
        break;
      }
    }
    const queryBtn = this.page.locator('main button').filter({ hasText: /Query|查询/ }).first();
    if (await queryBtn.count() > 0) {
      await queryBtn.click();
      await this.page.waitForTimeout(2000);
    }
  }

  async getDataRowCount(tableIndex: number = 0): Promise<number> {
    const table = this.page.locator('table').nth(tableIndex);
    const rows = table.locator('tbody tr');
    const count = await rows.count();
    let dataCount = 0;
    for (let i = 0; i < count; i++) {
      const tds = rows.nth(i).locator('td');
      const tdCount = await tds.count();
      if (tdCount > 1) {
        dataCount++;
      }
    }
    return dataCount;
  }

  async hasEmptyState(tableIndex: number = 0): Promise<boolean> {
    const table = this.page.locator('table').nth(tableIndex);
    const body = table.locator('tbody');
    const text = await body.innerText().catch(() => '');
    return text.includes('暂无数据') || text.includes('No data') || text.includes('No results') || text.trim() === '';
  }

  async selectRow(tableIndex: number, rowIndex: number) {
    const table = this.page.locator('table').nth(tableIndex);
    const checkbox = table.locator('tbody tr').nth(rowIndex).locator('input[type="checkbox"]:not([aria-hidden="true"])').first();
    if (await checkbox.count() > 0) {
      await checkbox.check();
      await this.page.waitForTimeout(300);
    }
  }
}
