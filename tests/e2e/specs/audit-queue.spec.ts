import { test, expect } from '../fixtures/auth.fixture';
import { AuditQueuePage } from '../pages/audit-queue.page';

test.describe('Audit Queue', () => {
  let auditPage: AuditQueuePage;

  test.beforeEach(async ({ authenticatedPage }) => {
    auditPage = new AuditQueuePage(authenticatedPage);
    await auditPage.goto();
    await auditPage.expectLoaded();
  });

  test('page loads with data table on Pending tab', async () => {
    await expect(auditPage.heading).toHaveText('出站审核');

    const activeTab = await auditPage.getActiveTabValue();
    expect(activeTab).toContain('待审核');

    const headers = await auditPage.getTableHeaders().allTextContents();
    expect(headers.length).toBeGreaterThan(0);

    const rowCount = await auditPage.getRowCount();
    expect(rowCount).toBeGreaterThanOrEqual(0);
  });

  test('switch to Approved tab shows approved items', async () => {
    await auditPage.switchToApproved();

    const activeTab = await auditPage.getActiveTabValue();
    expect(activeTab).toContain('已批准');
  });

  test('switch to Rejected tab shows rejected items', async () => {
    await auditPage.switchToRejected();

    const activeTab = await auditPage.getActiveTabValue();
    expect(activeTab).toContain('已拒绝');
  });

  test('tab switching maintains correct data', async () => {
    await auditPage.switchToApproved();
    const approvedTab = await auditPage.getActiveTabValue();
    expect(approvedTab).toContain('已批准');

    await auditPage.switchToRejected();
    const rejectedTab = await auditPage.getActiveTabValue();
    expect(rejectedTab).toContain('已拒绝');

    await auditPage.switchToPending();
    const pendingTab = await auditPage.getActiveTabValue();
    expect(pendingTab).toContain('待审核');
  });

  test('select individual item shows batch action buttons', async () => {
    const rowCount = await auditPage.getDataRowCount();
    if (rowCount === 0) return;

    await auditPage.selectRow(0);

    await expect(auditPage.batchApproveButton).toBeVisible();
    await expect(auditPage.batchRejectButton).toBeVisible();

    const approveCount = await auditPage.getBatchApproveCount();
    const rejectCount = await auditPage.getBatchRejectCount();
    expect(approveCount).toBe(1);
    expect(rejectCount).toBe(1);
  });

  test('select all items shows batch action buttons with correct count', async () => {
    const rowCount = await auditPage.getDataRowCount();
    if (rowCount === 0) return;

    await auditPage.selectAll();

    await expect(auditPage.batchApproveButton).toBeVisible();
    await expect(auditPage.batchRejectButton).toBeVisible();

    const approveCount = await auditPage.getBatchApproveCount();
    const rejectCount = await auditPage.getBatchRejectCount();
    expect(approveCount).toBeGreaterThan(0);
    expect(rejectCount).toBeGreaterThan(0);
    expect(approveCount).toBe(rejectCount);
  });

  test('empty state shows when no items in a tab', async () => {
    const dataCount = await auditPage.getDataRowCount();
    if (dataCount > 0) return;

    const isEmpty = await auditPage.hasEmptyState();
    expect(isEmpty).toBeTruthy();
  });

  test('approve dialog opens with correct title and fields', async () => {
    const rowCount = await auditPage.getDataRowCount();
    if (rowCount === 0) return;

    await auditPage.getRowApproveButton(0).click();
    await auditPage.dialog.waitFor({ state: 'visible' });

    await expect(auditPage.dialogTitle).toContainText('批准');
    await expect(auditPage.dialogTextarea).toBeVisible();
    await expect(auditPage.dialogConfirmButton).toBeVisible();
    await expect(auditPage.dialogCancelButton).toBeVisible();

    await auditPage.cancelDialog();
  });

  test('reject dialog opens with correct title and fields', async () => {
    const rowCount = await auditPage.getDataRowCount();
    if (rowCount === 0) return;

    await auditPage.getRowRejectButton(0).click();
    await auditPage.dialog.waitFor({ state: 'visible' });

    await expect(auditPage.dialogTitle).toContainText('拒绝');
    await expect(auditPage.dialogTextarea).toBeVisible();
    await expect(auditPage.dialogConfirmButton).toBeVisible();
    await expect(auditPage.dialogCancelButton).toBeVisible();

    await auditPage.cancelDialog();
  });

  test('dialog cancel closes without action', async () => {
    const rowCount = await auditPage.getDataRowCount();
    if (rowCount === 0) return;

    await auditPage.getRowApproveButton(0).click();
    await auditPage.dialog.waitFor({ state: 'visible' });
    await auditPage.cancelDialog();

    await expect(auditPage.dialog).not.toBeVisible();
  });

  test('dialog notes textarea accepts input', async () => {
    const rowCount = await auditPage.getDataRowCount();
    if (rowCount === 0) return;

    await auditPage.getRowApproveButton(0).click();
    await auditPage.dialog.waitFor({ state: 'visible' });

    await auditPage.fillNotes('E2E test approve note');
    const value = await auditPage.dialogTextarea.inputValue();
    expect(value).toBe('E2E test approve note');

    await auditPage.cancelDialog();
  });

  test('selecting and deselecting rows updates batch count', async () => {
    const rowCount = await auditPage.getDataRowCount();
    if (rowCount < 2) return;

    await auditPage.selectRow(0);
    let count = await auditPage.getBatchApproveCount();
    expect(count).toBe(1);

    await auditPage.selectRow(1);
    count = await auditPage.getBatchApproveCount();
    expect(count).toBe(2);

    await auditPage.selectRow(0);
    count = await auditPage.getBatchApproveCount();
    expect(count).toBe(1);
  });

  test('table has expected columns', async () => {
    const headers = await auditPage.getTableHeaders().allTextContents();
    expect(headers).toContain('ID');
    expect(headers.some(h => h.includes('发件人'))).toBeTruthy();
    expect(headers.some(h => h.includes('收件人'))).toBeTruthy();
    expect(headers.some(h => h.includes('主题'))).toBeTruthy();
    expect(headers.some(h => h.includes('操作'))).toBeTruthy();
  });

  test('batch approve button is hidden when no items selected', async () => {
    const rowCount = await auditPage.getDataRowCount();
    if (rowCount === 0) return;

    await expect(auditPage.batchApproveButton).not.toBeVisible();
    await expect(auditPage.batchRejectButton).not.toBeVisible();
  });
});
