import { test, expect } from '../fixtures/auth.fixture';
import type { APIRequestContext } from '@playwright/test';

const INGEST_URL =
  (process.env.INTERNAL_API_BASE_URL || 'https://localhost:18081') +
  '/internal/mail-logs/ingest';

async function seedMailLog(
  request: APIRequestContext,
  overrides: Record<string, unknown> = {},
): Promise<void> {
  const now = new Date().toISOString();
  const uid = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
  const row = {
    message_id: `<rv-${uid}@test.local>`,
    message_uuid: crypto.randomUUID(),
    queue_id: `RV${uid}`,
    client_ip: '203.0.113.90',
    sender: `rv-${uid}@test.local`,
    sender_domain: 'test.local',
    recipients: [`rv-${uid}-rcpt@testdomain.local`],
    subject: `review-test ${uid}`,
    action: 'quarantine',
    status: 'quarantined',
    direction: 'receive',
    email_type: 'spam',
    email_type_overridden: false,
    email_type_original: '',
    correction_source: '',
    delivery_status_summary: 'quarantined',
    received_at: now,
    timestamp: now,
    ...overrides,
  };
  const resp = await request.post(INGEST_URL, {
    data: [row],
    headers: { 'Content-Type': 'application/json' },
  });
  expect(resp.status()).toBeLessThan(300);
}

async function seedCorrectedMailLog(
  request: APIRequestContext,
): Promise<void> {
  const subject = `corrected-review-${Date.now().toString(36)}`;
  await seedMailLog(request, {
    subject,
    email_type: 'normal',
    email_type_overridden: true,
    email_type_original: 'spam',
    correction_source: 'admin_release',
  });
}

test.describe('Email Disposal Review E2E', () => {
  test.beforeAll(async ({ request }) => {
    await seedMailLog(request);
    await seedCorrectedMailLog(request);
  });

  test.beforeEach(async ({ authenticatedPage }) => {
    await authenticatedPage.goto('/zh/email-disposal/center');
    await authenticatedPage.waitForLoadState('networkidle');
    await authenticatedPage.waitForTimeout(1500);
  });

  // §3.2: email type column + corrected badge + tooltip
  test('email type column shows corrected badge with tooltip for overridden mails', async ({
    authenticatedPage,
  }) => {
    // Scope to the table with an exact match: the correction-quality summary
    // card also contains 已纠正 (as a substring of "区间内已纠正 N 封"), which is
    // not a tooltip trigger — a bare text= substring match would hover that
    // instead of a real per-row corrected badge.
    const correctedBadge = authenticatedPage
      .locator('table')
      .getByText('已纠正', { exact: true });
    if ((await correctedBadge.count()) === 0) {
      test.skip(true, 'No corrected mail in seeded data — skipping');
      return;
    }
    const badge = correctedBadge.first();
    await expect(badge).toBeVisible({ timeout: 10000 });
    await badge.hover();
    // base-ui Tooltip renders its popup with data-slot="tooltip-content" (not role="tooltip").
    const tooltip = authenticatedPage.locator('[data-slot="tooltip-content"]');
    await expect(tooltip.first()).toBeVisible({ timeout: 5000 });
  });

  // §2: investigation/disposal parity
  test('investigation page loads with same structure as disposal page', async ({
    authenticatedPage,
  }) => {
    await authenticatedPage.goto('/zh/logs/mail-investigation');
    await authenticatedPage.waitForLoadState('networkidle');
    await authenticatedPage.waitForTimeout(1500);

    const heading = authenticatedPage.locator('main h1');
    await expect(heading).toBeVisible({ timeout: 10000 });
    const headingText = await heading.textContent();
    expect(headingText).toContain('调查');

    const table = authenticatedPage.locator('table').first();
    await expect(table).toBeVisible({ timeout: 10000 });
  });

  // §5.1/§5.3: 17-state display status filter — regression for review
  // finding 1 ("现有测试只检查是否存在一个'召回'选项，没有断言完整 17 态集合").
  // Asserts the dropdown renders exactly the 17-state option set (labels
  // from webapp/messages/zh.json emailDisposal.filters.statuses) and that
  // the removed legacy buckets (处理中/延迟检测中, i.e. processing/
  // delay_detecting) no longer appear.
  test('display status filter shows exactly the 17 states, not the legacy processing/delay_detecting buckets', async ({
    authenticatedPage,
  }) => {
    // 邮件状态 is a column-header filter (Popover + checkbox rows), not a
    // standalone labelled Select — the 2026-07-18 html_spec alignment moved it
    // into the table header (html_spec §列定义: 表头列). Address it by its
    // testid: the previous locator walked from a label to its parent's
    // button[role=combobox], which no longer exists, and such position-guessing
    // locators break on any surrounding markup change.
    const statusTrigger = authenticatedPage.getByTestId('disposal-table-filter-statuses');
    await expect(statusTrigger).toBeVisible({ timeout: 10000 });
    await statusTrigger.click();

    // Options are <label> rows inside the popover, each holding a checkbox.
    const options = authenticatedPage.locator('[data-slot="popover-content"] label');
    await expect(options.first()).toBeVisible({ timeout: 5000 });
    const labels = (await options.allTextContents()).map((l) => l.trim());
    // 与 mail-list-table.tsx 的 statusOptions 一一对应（17 项，顺序无关）：
    // rejected / bounced / discarded / quarantine_pending / sideline_pending /
    // audit_pending / reviewed_rejected / expired / deleted / delivering /
    // delivered / partial_delivered / delivery_failed / recall_pending /
    // recall_success / recall_failed / partial_recall_success。
    // 文案取自 webapp/messages/zh.json emailDisposal.filters.statuses。
    const expected17 = [
      '拒收', '已退信', '已丢弃', '隔离中', '检测中', '待审核', '审核驳回',
      '已过期', '已删除', '投递中', '投递成功', '部分投递成功', '投递失败',
      '召回中', '召回成功', '召回失败', '部分召回成功',
    ];
    // 精确集合比较，不用 includes 子串匹配：'投递成功' 是 '部分投递成功' 的子串，
    // 子串口径会互相误配，既数不准也发现不了改名（本次就是 rejected 由 已拒绝
    // 改成 拒收、以及漏了 sideline_pending=检测中，而旧断言只体现为数量对不上）。
    expect([...labels].sort()).toEqual([...expected17].sort());
    for (const legacy of ['处理中', '延迟检测中']) {
      expect(labels).not.toContain(legacy);
    }

    await authenticatedPage.keyboard.press('Escape');
  });

  // §3.3: email type quick filter
  test('email type quick filter selects and deselects types', async ({
    authenticatedPage,
  }) => {
    // The 邮件类型 quick filter is a MultiSelectFilter (Popover + checkbox
    // items), not a Select with role=option: its label 邮件类型 is separate
    // from the combobox button that opens the popover. Open it via that button,
    // then toggle the 垃圾邮件 (spam) checkbox and assert the trigger summary
    // reflects select → deselect (summary shows the type when 1 is selected,
    // and the placeholder 全部 when none are).
    // 09ee6b4cdd: 结构化筛选（邮件类型等）默认折叠在「高级筛选」开关后面。
    await authenticatedPage.getByTestId('disposal-filters-toggle').click();
    const mailTypeLabel = authenticatedPage.locator('label').filter({ hasText: /^邮件类型$/ }).first();
    await expect(mailTypeLabel).toBeVisible({ timeout: 10000 });
    const trigger = mailTypeLabel.locator('..').getByRole('button').first();

    await trigger.click();
    const popover = authenticatedPage.locator('[data-slot="popover-content"]');
    await expect(popover).toBeVisible({ timeout: 5000 });

    const spamItem = popover.getByText('垃圾邮件', { exact: true });
    await expect(spamItem).toBeVisible({ timeout: 5000 });

    // select spam → the trigger summary shows the single selected type
    await spamItem.click();
    await expect(trigger).toContainText('垃圾邮件', { timeout: 5000 });

    // deselect spam → the trigger summary returns to the placeholder (全部)
    await spamItem.click();
    await expect(trigger).toContainText('全部', { timeout: 5000 });

    await authenticatedPage.keyboard.press('Escape');
    await expect(popover).toBeHidden({ timeout: 5000 });
  });
});
