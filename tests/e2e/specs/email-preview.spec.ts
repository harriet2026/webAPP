import { test, expect } from '../fixtures/auth.fixture';
import { QuarantinePage } from '../pages/quarantine.page';
import { AuditQueuePage } from '../pages/audit-queue.page';
import { SidelinePage } from '../pages/sideline.page';

test.describe('Email Preview - Quarantine', () => {
  let quarantinePage: QuarantinePage;

  test.beforeEach(async ({ authenticatedPage }) => {
    quarantinePage = new QuarantinePage(authenticatedPage);
    await quarantinePage.goto();
    await quarantinePage.expectLoaded();
  });

  test('preview button visible in table rows', async () => {
    const dataCount = await quarantinePage.getDataRowCount();
    if (dataCount === 0) return;

    const previewBtn = quarantinePage.getPreviewButton(0);
    await expect(previewBtn).toBeVisible();
  });

  test('click preview opens dialog', async () => {
    const dataCount = await quarantinePage.getDataRowCount();
    if (dataCount === 0) return;

    await quarantinePage.clickPreview(0);

    const dialog = quarantinePage.getPreviewDialog();
    await expect(dialog).toBeVisible();
    await expect(dialog.locator('text=邮件预览')).toBeVisible();

    await quarantinePage.closePreviewDialog();
  });

  test('preview dialog shows email metadata', async () => {
    const dataCount = await quarantinePage.getDataRowCount();
    if (dataCount === 0) return;

    await quarantinePage.clickPreview(0);

    const dialog = quarantinePage.getPreviewDialog();
    await expect(dialog).toBeVisible();

    const subjectText = await dialog.locator('text=主题').first().textContent();
    expect(subjectText).toBeTruthy();

    const fromText = await dialog.locator('text=发件人').first().textContent();
    expect(fromText).toBeTruthy();

    await quarantinePage.closePreviewDialog();
  });

  test('preview dialog shows iframe for HTML content', async () => {
    const dataCount = await quarantinePage.getDataRowCount();
    if (dataCount === 0) return;

    await quarantinePage.clickPreview(0);

    const iframe = quarantinePage.getPreviewDialogContent();
    if (await iframe.count() > 0) {
      await expect(iframe).toBeVisible();
    }

    await quarantinePage.closePreviewDialog();
  });

  test('preview dialog has download button', async () => {
    const dataCount = await quarantinePage.getDataRowCount();
    if (dataCount === 0) return;

    await quarantinePage.clickPreview(0);

    const downloadBtn = quarantinePage.getPreviewDownloadButton();
    await expect(downloadBtn).toBeVisible();

    await quarantinePage.closePreviewDialog();
  });

  test('preview dialog shows raw headers section', async () => {
    const dataCount = await quarantinePage.getDataRowCount();
    if (dataCount === 0) return;

    await quarantinePage.clickPreview(0);

    const rawHeadersTrigger = quarantinePage.getRawHeadersTrigger();
      if (await rawHeadersTrigger.count() > 0) {
        await expect(rawHeadersTrigger).toBeVisible();

        await rawHeadersTrigger.click();
        await quarantinePage.page.waitForTimeout(300);

        await expect(rawHeadersTrigger).toHaveAttribute('aria-expanded', 'true');
      }

    await quarantinePage.closePreviewDialog();
  });

  test('preview dialog can be closed', async () => {
    const dataCount = await quarantinePage.getDataRowCount();
    if (dataCount === 0) return;

    await quarantinePage.clickPreview(0);
    const dialog = quarantinePage.getPreviewDialog();
    await expect(dialog).toBeVisible();

    await quarantinePage.closePreviewDialog();
    await expect(dialog).not.toBeVisible();
  });
});

test.describe('Email Preview - Audit Queue', () => {
  let auditPage: AuditQueuePage;

  test.beforeEach(async ({ authenticatedPage }) => {
    auditPage = new AuditQueuePage(authenticatedPage);
    await auditPage.goto();
    await auditPage.expectLoaded();
  });

  test('preview button visible in pending tab', async () => {
    const dataCount = await auditPage.getDataRowCount();
    if (dataCount === 0) return;

    const previewBtn = auditPage.getPreviewButton(0);
    await expect(previewBtn).toBeVisible();
  });

  test('click preview opens dialog', async () => {
    const dataCount = await auditPage.getDataRowCount();
    if (dataCount === 0) return;

    await auditPage.clickPreview(0);

    const dialog = auditPage.getPreviewDialog();
    await expect(dialog).toBeVisible();

    await auditPage.closePreviewDialog();
  });
});

test.describe('Email Preview - Sideline', () => {
  let sidelinePage: SidelinePage;

  test.beforeEach(async ({ authenticatedPage }) => {
    sidelinePage = new SidelinePage(authenticatedPage);
    await sidelinePage.goto();
    await sidelinePage.expectLoaded();
  });

  test('preview button visible in table rows', async () => {
    const dataCount = await sidelinePage.getDataRowCount();
    if (dataCount === 0) return;

    const previewBtn = sidelinePage.getPreviewButton(0);
    await expect(previewBtn).toBeVisible();
  });

  test('click preview opens dialog', async () => {
    const dataCount = await sidelinePage.getDataRowCount();
    if (dataCount === 0) return;

    await sidelinePage.clickPreview(0);

    const dialog = sidelinePage.getPreviewDialog();
    await expect(dialog).toBeVisible();

    await sidelinePage.closePreviewDialog();
  });
});
