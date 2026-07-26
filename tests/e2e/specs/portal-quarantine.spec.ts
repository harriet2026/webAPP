import { test, expect } from '@playwright/test';
import type { EmailPreviewResponse } from '@/types/email-preview';

// GT-12077 code-review follow-up: the previous Python E2E only did
// requests.get() against these Next pages, which proves the route returns
// HTML but never executes the client-side fetch()es or asserts the rendered
// UI. These pages are UNAUTHENTICATED (the recipient is a mailbox user, not
// a console user) — every test here uses the plain @playwright/test `page`
// fixture (a fresh, cookie-less context), never the authenticatedPage
// fixture from fixtures/auth.fixture.ts.

const MAIL_ID = '00000000-0000-4000-8000-000000000001';

function mockPreview(overrides: Partial<EmailPreviewResponse> = {}): EmailPreviewResponse {
  return {
    message_id: '<gt12077-preview@test.local>',
    subject: 'Quarterly report — please review',
    from: 'sender@example.org',
    from_name: 'Alice Sender',
    to: [{ addr: 'recipient@testdomain.local', name: '', dn: '', isto: true }],
    cc: null,
    text_body: 'plain text body',
    html_body: '<p id="portal-preview-marker">Hello from the sandboxed body</p>',
    attachments: null,
    urls: null,
    headers: { Date: 'Tue, 14 Jul 2026 08:00:00 +0000' },
    ...overrides,
  };
}

test.describe('Portal quarantine pages (unauthenticated)', () => {
  test('release page: invalid/expired token renders the expired state', async ({ page }) => {
    await page.goto(`/zh/portal/quarantine/${MAIL_ID}/release?token=not-a-valid-token`);
    await expect(page.getByText('链接已过期或无效')).toBeVisible();
    // Not a crash / blank page: the confirm button must NOT be present.
    await expect(page.getByRole('button')).toHaveCount(0);
  });

  test('preview page: invalid/expired token renders the same expired state', async ({ page }) => {
    await page.goto(`/zh/portal/quarantine/${MAIL_ID}/preview?token=not-a-valid-token`);
    await expect(page.getByText('链接已过期或无效')).toBeVisible();
  });

  test('preview page: purged-by-retention (404) shows the dedicated purged copy, not generic error', async ({ page }) => {
    await page.route(`**/api/portal/quarantine/${MAIL_ID}/preview*`, async (route) => {
      await route.fulfill({ status: 404, contentType: 'application/json', body: JSON.stringify({ error: 'not_found' }) });
    });
    await page.goto(`/zh/portal/quarantine/${MAIL_ID}/preview?token=validly-signed-token`);

    // Dedicated purged-by-retention copy must render...
    await expect(page.getByText('邮件已超出保留期')).toBeVisible();
    await expect(page.getByText('该邮件已超出隔离区保留期限并被清理，无法再预览。')).toBeVisible();
    // ...and NOT the generic error/expired copy (an operational failure and a
    // purged mail must not look the same to the user).
    await expect(page.getByText('加载失败')).toHaveCount(0);
    await expect(page.getByText('链接已过期或无效')).toHaveCount(0);
  });

  test('preview page: success renders subject/sender and sandboxes the HTML body in an iframe', async ({ page }) => {
    const preview = mockPreview();
    await page.route(`**/api/portal/quarantine/${MAIL_ID}/preview*`, async (route) => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(preview) });
    });
    await page.goto(`/zh/portal/quarantine/${MAIL_ID}/preview?token=validly-signed-token`);

    await expect(page.getByText(preview.subject)).toBeVisible();
    await expect(page.getByText(`${preview.from_name} <${preview.from}>`)).toBeVisible();

    // The mail body is hostile content and must stay sandboxed inside an
    // iframe — assert the iframe exists, and that the body text is NOT
    // injected directly into the top-level page DOM outside of it.
    const iframe = page.locator('iframe[title="Email content"]');
    await expect(iframe).toHaveCount(1);
    await expect(iframe.contentFrame().getByText('Hello from the sandboxed body')).toBeVisible();
    await expect(page.locator('body > :not(iframe) #portal-preview-marker')).toHaveCount(0);
  });

  test('preview page: a text/plain-only mail renders its text body, not a blank iframe', async ({ page }) => {
    // Plenty of quarantined mail (spam/phishing especially) is text/plain-only:
    // html_body comes back empty and the whole body lives in text_body. Rendering
    // only the HTML part left those previews as an EMPTY iframe — the page
    // "succeeded" and showed the recipient nothing at all (GT-12077 review D2).
    const preview = mockPreview({
      html_body: '',
      text_body: 'This mail has no HTML part at all — only plain text.',
    });
    await page.route(`**/api/portal/quarantine/${MAIL_ID}/preview*`, async (route) => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(preview) });
    });
    await page.goto(`/zh/portal/quarantine/${MAIL_ID}/preview?token=validly-signed-token`);

    await expect(page.getByTestId('portal-preview-text-body')).toContainText(
      'This mail has no HTML part at all',
    );
    // No HTML part → no iframe at all (nothing to sandbox), and definitely not an
    // empty one standing in for the missing body.
    await expect(page.locator('iframe[title="Email content"]')).toHaveCount(0);
  });

  test('preview page: a mail with neither body part says so instead of rendering blank', async ({ page }) => {
    const preview = mockPreview({ html_body: '', text_body: '' });
    await page.route(`**/api/portal/quarantine/${MAIL_ID}/preview*`, async (route) => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(preview) });
    });
    await page.goto(`/zh/portal/quarantine/${MAIL_ID}/preview?token=validly-signed-token`);

    await expect(page.getByText('该邮件没有可显示的正文内容。')).toBeVisible();
  });

  test('middleware: bare locale-less /portal URL is neither redirected to /login nor 404s', async ({ browser }) => {
    // Fresh context with NO auth cookie at all — simulates a recipient
    // clicking the digest link who has never logged into the console.
    const context = await browser.newContext();
    const page = await context.newPage();
    try {
      const response = await page.goto(`/portal/quarantine/${MAIL_ID}/release?token=bad`);
      expect(response?.status()).toBeLessThan(400);
      await expect(page).not.toHaveURL(/\/login/);
      // Lands on the localized portal page (next-intl rewrites the bare
      // /portal/... path to /<locale>/portal/...).
      await expect(page).toHaveURL(/\/(zh|en|th|ru)\/portal\/quarantine\//);
      // And renders the portal UI, not a 404 page.
      await expect(page.getByText('链接已过期或无效')).toBeVisible();
    } finally {
      await context.close();
    }
  });
});
