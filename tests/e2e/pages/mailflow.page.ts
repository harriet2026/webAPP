import { Page, Locator } from '@playwright/test';
import { expect } from '../fixtures/auth.fixture';

// DirectionControlBar (webapp/src/components/monitoring/mailflow/DirectionControlBar.tsx)
// renders three base-ui Selects in this order: node (w-48), range (w-36),
// direction (w-36, wrapped in a Tooltip when directionDisabled). The trigger
// text is the i18n *label* (zh), not the raw value, so we map back here.
const DIRECTION_LABELS: Record<string, string> = {
  all: '全部',
  receive: '接收',
  send: '外发',
  internal: '域内',
};
const RANGE_LABELS: Record<string, string> = {
  '1h': '近 1 小时',
  '24h': '近 24 小时',
  '7d': '近 7 天',
};
const TAB_LABELS: Record<string, string> = {
  queue: '队列监控',
  delivery: '投递质量',
  connection: '连接会话',
};

function invert(map: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const k of Object.keys(map)) out[map[k]] = k;
  return out;
}

const DIRECTION_BY_LABEL = invert(DIRECTION_LABELS);
const RANGE_BY_LABEL = invert(RANGE_LABELS);

export class MailflowPage {
  readonly page: Page;
  readonly heading: Locator;
  /** All three Select triggers inside the control bar, in DOM order: node, range, direction. */
  readonly selectTriggers: Locator;
  readonly tabsList: Locator;
  readonly refreshButton: Locator;

  constructor(page: Page) {
    this.page = page;
    this.heading = page.locator('main h1');
    this.selectTriggers = page.locator('main [data-slot="select-trigger"]');
    this.tabsList = page.locator('main [data-slot="tabs-trigger"]');
    this.refreshButton = page
      .locator('main button')
      .filter({ has: page.locator('svg.lucide-refresh-cw') })
      .first();
  }

  async goto() {
    await this.page.goto('/zh/monitoring/mailflow');
    await this.page.waitForLoadState('networkidle');
  }

  async expectLoaded() {
    await this.heading.waitFor({ state: 'visible', timeout: 15000 });
    await expect(this.heading, 'mailflow page title').toHaveText('邮件流');
    await this.tabsList.first().waitFor({ state: 'visible', timeout: 10000 });
  }

  /** Returns the value (queue|delivery|connection) of the active tab. */
  async getActiveTab(): Promise<string> {
    const active = this.page.locator('main [data-slot="tabs-trigger"][data-active]');
    const label = (await active.innerText()).trim();
    for (const k of Object.keys(TAB_LABELS)) {
      if (TAB_LABELS[k] === label) return k;
    }
    throw new Error(`unknown active tab label: ${label}`);
  }

  async clickTab(name: 'queue' | 'delivery' | 'connection') {
    const label = TAB_LABELS[name];
    const trigger = this.tabsList.filter({ hasText: label }).first();
    await trigger.waitFor({ state: 'visible', timeout: 5000 });
    await trigger.click();
    await this.page.waitForTimeout(400);
  }

  /** The range trigger is the 2nd select-trigger in the control bar. */
  private rangeTrigger(): Locator {
    return this.selectTriggers.nth(1);
  }

  /** The direction trigger is the 3rd select-trigger in the control bar. */
  private directionTrigger(): Locator {
    return this.selectTriggers.nth(2);
  }

  async getRange(): Promise<string> {
    const label = (await this.rangeTrigger().innerText()).trim();
    const v = RANGE_BY_LABEL[label];
    if (!v) throw new Error(`unknown range label: ${label}`);
    return v;
  }

  async getDirection(): Promise<string> {
    const label = (await this.directionTrigger().innerText()).trim();
    const v = DIRECTION_BY_LABEL[label];
    if (!v) throw new Error(`unknown direction label: ${label}`);
    return v;
  }

  private async pickSelectValue(trigger: Locator, label: string) {
    await trigger.click();
    const item = this.page
      .locator('[data-slot="select-item"]')
      .filter({ hasText: label })
      .first();
    await item.waitFor({ state: 'visible', timeout: 5000 });
    await item.click();
    await this.page.waitForTimeout(400);
  }

  async setRange(r: '1h' | '24h' | '7d') {
    await this.pickSelectValue(this.rangeTrigger(), RANGE_LABELS[r]);
  }

  async setDirection(d: 'all' | 'receive' | 'send' | 'internal') {
    await this.pickSelectValue(this.directionTrigger(), DIRECTION_LABELS[d]);
  }

  /**
   * Whether the direction Select is disabled. base-ui sets `data-disabled`
   * on the trigger when the underlying Select is `disabled`.
   */
  async isDirectionDisabled(): Promise<boolean> {
    const trigger = this.directionTrigger();
    const attr = await trigger.getAttribute('data-disabled');
    return attr !== null;
  }

  async clickRefresh() {
    await this.refreshButton.click();
  }

  /** The EmptyState banner (StateBanners.tsx) renders the mailflow.noData text. */
  async expectEmptyState() {
    await expect(
      this.page.locator('main').getByText('暂无数据', { exact: true }).first(),
    ).toBeVisible({ timeout: 10000 });
  }
}
