import { test, expect } from '../fixtures/auth.fixture';
import { seedMailLogs } from '../helpers/seed-data';
import { waitForDataRow, findRowBySubject } from '../helpers/mail-list';

const INGEST_URL = (process.env.INTERNAL_API_BASE_URL || 'https://localhost:18081') + '/internal/mail-logs/ingest';

// A releasable row: 放行 is enabled only when the backend display_statuses
// list contains one of {quarantine_pending, sideline_pending, audit_pending}
// (mail-list-table.tsx `canRelease`, GT-12782 Task 4 — the status is
// backend-downlinked, the frontend derives nothing). seedMailLogs() only produces accept/delivered and
// reject/rejected rows — none of them releasable — so the enablement test used
// to depend on some *other* spec having left a quarantined row at the top of
// the list. Seed and select our own row instead of trusting list order.
const RELEASABLE_SUBJECT = `Toolbar Releasable ${Date.now()}`;

async function seedReleasableRow(request: import('@playwright/test').APIRequestContext) {
  const now = new Date().toISOString();
  const uid = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
  await request.post(INGEST_URL, {
    data: [{
      message_id: `<toolbar-${uid}@test.local>`,
      message_uuid: crypto.randomUUID(),
      queue_id: `TB${uid}`,
      client_ip: '203.0.113.77',
      sender: `toolbar-${uid}@test.local`,
      sender_domain: 'test.local',
      recipients: [`toolbar-${uid}@testdomain.local`],
      subject: RELEASABLE_SUBJECT,
      action: 'quarantine',
      status: 'quarantined',
      direction: 'receive',
      delivery_status_summary: 'quarantined',
      received_at: now,
      timestamp: now,
    }],
    headers: { 'Content-Type': 'application/json' },
  });
}

// GT-11580: the email-disposal list must show a PERMANENT batch toolbar (per
// spec §6.3 the batch actions are always visible, only enabled/disabled by the
// selection) plus a total-count text and a column-settings menu. Before the fix
// the whole toolbar only rendered once a row was selected, so 共 N 条 / 设置 and
// the batch buttons were absent at rest.
test.describe('Email Disposal Center 批量操作工具栏 (GT-11580)', () => {
  test.beforeAll(async ({ request }) => {
    await seedMailLogs(request);
    await seedReleasableRow(request);
  });

  test.beforeEach(async ({ authenticatedPage }) => {
    await authenticatedPage.goto('/zh/email-disposal/center');
    await authenticatedPage.waitForLoadState('networkidle');
    await authenticatedPage.waitForTimeout(1500);
  });

  test('工具栏在无选中时也常驻显示（总数 + 批量按钮 + 设置）', async ({ authenticatedPage }) => {
    // Total count "共 N 条" is present at rest.
    await expect(authenticatedPage.getByText(/共\s*\d+\s*条/).first()).toBeVisible({ timeout: 10000 });
    // Batch buttons render at rest.
    for (const label of ['放行', '删除', '导出', '设置']) {
      await expect(authenticatedPage.getByRole('button', { name: label }).first()).toBeVisible({ timeout: 10000 });
    }
  });

  test('无选中时批量按钮禁用，选中一行后启用', async ({ authenticatedPage }) => {
    const release = authenticatedPage.getByRole('button', { name: '放行' }).first();
    const del = authenticatedPage.getByRole('button', { name: '删除' }).first();
    const exp = authenticatedPage.getByRole('button', { name: '导出' }).first();

    await expect(release).toBeDisabled();
    await expect(del).toBeDisabled();
    await expect(exp).toBeDisabled();

    // Select the row we seeded, not whatever happens to be first: the batch
    // buttons enable per the SELECTED row's status, so an arbitrary first row
    // (e.g. a delivered one seeded by another spec) leaves 放行 disabled and the
    // failure looks like a toolbar bug rather than a row-choice problem.
    const row = await findRowBySubject(authenticatedPage, RELEASABLE_SUBJECT);
    expect(row, `expected the seeded releasable row "${RELEASABLE_SUBJECT}"`).not.toBeNull();
    await row!.locator('input[type="checkbox"], [role="checkbox"]').first().click();

    await expect(release).toBeEnabled();
    await expect(del).toBeEnabled();
    await expect(exp).toBeEnabled();
  });

  test('设置菜单可切换列显隐', async ({ authenticatedPage }) => {
    const row = await waitForDataRow(authenticatedPage);
    if (!row) {
      test.skip();
      return;
    }
    // Sender column header is visible to start with.
    const senderHeader = authenticatedPage.locator('table thead th', { hasText: '发信人' }).first();
    await expect(senderHeader).toBeVisible({ timeout: 10000 });

    // Open the column-settings menu (testid — several other "设置" buttons exist
    // on the page) and uncheck 发信人.
    await authenticatedPage.getByTestId('disposal-column-settings').click();
    const senderItem = authenticatedPage.getByRole('menuitemcheckbox', { name: '发信人' });
    await expect(senderItem).toBeVisible({ timeout: 5000 });
    await senderItem.click();
    // Close the menu.
    await authenticatedPage.keyboard.press('Escape');

    // Sender column header is now hidden.
    await expect(authenticatedPage.locator('table thead th', { hasText: '发信人' })).toHaveCount(0, { timeout: 5000 });
  });
});
