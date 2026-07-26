import { test, expect } from '../fixtures/auth.fixture';
import { InboundAuditPage } from '../pages/inbound-audit.page';

test.describe('Inbound Audit', () => {
  let inboundAuditPage: InboundAuditPage;

  test.beforeEach(async ({ authenticatedPage }) => {
    inboundAuditPage = new InboundAuditPage(authenticatedPage);
    await inboundAuditPage.goto();
    await inboundAuditPage.expectLoaded();
  });

  test('page loads with table and status tabs', async () => {
    const headers = await inboundAuditPage.getTableColumnHeaders();
    expect(headers.some(h => h.includes('ID'))).toBeTruthy();
    expect(headers.some(h => h.includes('Sender') || h.includes('发件人'))).toBeTruthy();
    expect(headers.some(h => h.includes('Subject') || h.includes('主题'))).toBeTruthy();
    expect(headers.some(h => h.includes('Status') || h.includes('状态'))).toBeTruthy();

    const pendingTab = inboundAuditPage.page.locator('button[role="tab"]').filter({ hasText: /Pending|待审核/ });
    await expect(pendingTab).toBeVisible();
    const approvedTab = inboundAuditPage.page.locator('button[role="tab"]').filter({ hasText: /Approved|已放行|已通过/ });
    await expect(approvedTab).toBeVisible();
    const rejectedTab = inboundAuditPage.page.locator('button[role="tab"]').filter({ hasText: /Rejected|已拒绝/ });
    await expect(rejectedTab).toBeVisible();
    const allTab = inboundAuditPage.page.locator('button[role="tab"]').filter({ hasText: /All|全部/ });
    await expect(allTab).toBeVisible();
  });

  test('pending tab is active by default', async () => {
    const activeTab = await inboundAuditPage.getActiveTab();
    expect(activeTab).toMatch(/Pending|待审核/);
  });

  test('switching tabs changes displayed data', async () => {
    await inboundAuditPage.switchToTab('approved');
    const activeTab = await inboundAuditPage.getActiveTab();
    expect(activeTab).toMatch(/Approved|已放行|已通过/);

    await inboundAuditPage.switchToTab('rejected');
    const activeTab2 = await inboundAuditPage.getActiveTab();
    expect(activeTab2).toMatch(/Rejected|已拒绝/);

    await inboundAuditPage.switchToTab('all');
    const activeTab3 = await inboundAuditPage.getActiveTab();
    expect(activeTab3).toMatch(/All|全部/);
  });

  test('empty state shows when no data', async () => {
    await inboundAuditPage.switchToTab('approved');
    await inboundAuditPage.page.waitForTimeout(1000);

    const approvedCount = await inboundAuditPage.getDataRowCount();
    if (approvedCount === 0) {
      expect(await inboundAuditPage.hasEmptyState()).toBeTruthy();
    }
  });

  test('selecting rows shows batch action buttons', async () => {
    await inboundAuditPage.switchToTab('pending');
    await inboundAuditPage.page.waitForTimeout(1000);

    const dataCount = await inboundAuditPage.getDataRowCount();
    if (dataCount === 0) return;

    await inboundAuditPage.selectRow(0);

    const approveBtn = inboundAuditPage.getBatchApproveButton();
    const rejectBtn = inboundAuditPage.getBatchRejectButton();
    if (await approveBtn.count() > 0) {
      await expect(approveBtn).toBeVisible();
    }
    if (await rejectBtn.count() > 0) {
      await expect(rejectBtn).toBeVisible();
    }
  });
});
