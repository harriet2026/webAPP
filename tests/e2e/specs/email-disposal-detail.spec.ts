import { test, expect } from '../fixtures/auth.fixture';
import { findRowBySubject } from '../helpers/mail-list';
import type { APIRequestContext, Locator, Page } from '@playwright/test';

// DD-14: e2e coverage for the rebuilt detail drawer (Sheet + 3-section
// anchor-nav + scroll-spy) that DD-8..DD-11 built to replace the old
// Dialog+5-Tab UI. See .superpowers/sdd/dd14-brief.md for the strategy this
// file follows: real ingest + real backend for scenarios that only need a
// generically-supported seed shape (smoke, security-analysis, raw-logs,
// locale-switch), and page.route() response interception for scenarios that
// need the drawer to display a specific already-corrected/already-quarantined
// state or verify an outgoing request body — DD-13 already thoroughly
// verified the real backend reclassify/dispose/permission transitions, so
// this file's job is the frontend rendering + outgoing-request behavior only.

const INGEST_URL = (process.env.INTERNAL_API_BASE_URL || 'https://localhost:18081') + '/internal/mail-logs/ingest';

// The email-disposal center page's DEFAULT_ADVANCED filter only shows
// action=quarantine|sideline rows (see email-disposal-center-page.tsx) — a
// seeded row must use action:'quarantine' or it will be invisible in the
// list regardless of how carefully its subject is chosen.
async function seedDetailRow(
  request: APIRequestContext,
  subject: string,
  overrides: Record<string, unknown> = {},
): Promise<void> {
  const now = new Date().toISOString();
  const uid = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
  const row = {
    message_id: `<dd14-${uid}@test.local>`,
    message_uuid: crypto.randomUUID(),
    queue_id: `DD14${uid}`,
    client_ip: '203.0.113.90',
    sender: `dd14-${uid}@test.local`,
    sender_domain: 'test.local',
    recipients: [`dd14-${uid}-rcpt@testdomain.local`],
    subject,
    action: 'quarantine',
    status: 'quarantined',
    direction: 'receive',
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

// Verbatim-reused pattern from email-disposal-multitenant.spec.ts:11-25
// (mockProductForm is not exported there, so it's copied rather than
// imported). Overrides bootstrap's form/capabilities via route interception,
// then reloads so the SPA re-reads them.
async function mockProductForm(
  page: Page,
  form: string,
  capabilities: { ai: boolean; multiTenant: boolean; saas?: boolean },
) {
  await page.route('**/api/v1/bootstrap', async (route) => {
    const response = await route.fetch();
    const body = await response.json();
    await route.fulfill({
      response,
      json: { ...body, form, capabilities: { ...body.capabilities, ...capabilities } },
    });
  });
  await page.reload({ waitUntil: 'networkidle' });
}

// Builds a full MailLogDetail-shaped JSON body (field names verified against
// internal/models/mail_log.go and a live GET /mail-logs/:id response) for the
// route-interception scenarios that need the drawer to show a specific,
// otherwise-hard-to-construct state (see the brief's "why not a real
// pipeline" rationale).
function mockDetail(id: number, subject: string, overrides: Record<string, unknown> = {}) {
  const now = new Date().toISOString();
  return {
    id,
    message_id: `<dd14-mock-${id}@test.local>`,
    message_uuid: crypto.randomUUID(),
    client_ip: '198.51.100.20',
    sender: 'dd14-mock@test.local',
    sender_domain: 'test.local',
    recipients: ['dd14-mock-rcpt@testdomain.local'],
    authenticated: false,
    subject,
    action: 'quarantine',
    status: 'quarantined',
    processing_time_ms: 10,
    storage_size: 256,
    received_at: now,
    timestamp: now,
    direction: 'receive',
    email_type: 'normal',
    email_type_overridden: false,
    recipient_dispositions: [],
    ...overrides,
  };
}

interface CapturedRequest {
  url: string;
  body: Record<string, unknown>;
}

// Registers a single page.route() covering every /api/v1/mail-logs/* call:
//  - GET /mail-logs/<numeric id> (no further path segments) -> fulfilled
//    with detailOverride(id) when provided, letting a test pin the drawer's
//    displayed state (corrected badge, recipient matrix, etc.) without a
//    real backing quarantine/sideline object.
//  - POST .../bulk-dispose or .../recall -> captured into `capture` (so the
//    test can assert the outgoing action/final_type/object_id) and fulfilled
//    with a canned success response, exercising the UI's success-toast/
//    refetch path.
//  - everything else (events, preview, eml, similar-multi, parse-query, the
//    bare list endpoint) -> passed through to the real backend untouched.
async function routeMailLogAPI(
  page: Page,
  opts: {
    detailOverride?: (id: number) => Record<string, unknown>;
    analysisOverride?: (id: number) => Record<string, unknown>;
    eventsOverride?: (id: number) => Record<string, unknown>;
    capture?: CapturedRequest[];
  },
) {
  await page.route('**/api/v1/mail-logs/**', async (route) => {
    const req = route.request();
    const parts = new URL(req.url()).pathname.split('/').filter(Boolean);
    const idx = parts.indexOf('mail-logs');
    const seg = parts[idx + 1];
    const restLen = parts.length - idx - 2;

    if (opts.detailOverride && req.method() === 'GET' && restLen === 0 && /^\d+$/.test(seg)) {
      await route.fulfill({ json: opts.detailOverride(Number(seg)) });
      return;
    }

    if (opts.analysisOverride && req.method() === 'GET' && restLen === 1 && parts[idx + 2] === 'analysis' && /^\d+$/.test(seg)) {
      await route.fulfill({ json: opts.analysisOverride(Number(seg)) });
      return;
    }

    if (opts.eventsOverride && req.method() === 'GET' && restLen === 1 && parts[idx + 2] === 'events' && /^\d+$/.test(seg)) {
      await route.fulfill({ json: opts.eventsOverride(Number(seg)) });
      return;
    }

    if (opts.capture && req.method() === 'POST' && (seg === 'bulk-dispose' || seg === 'recall')) {
      const body = (req.postDataJSON() ?? {}) as Record<string, unknown>;
      opts.capture.push({ url: req.url(), body });
      if (seg === 'bulk-dispose') {
        await route.fulfill({
          json: {
            results: [{
              mail_log_id: (body.mail_log_ids as number[])?.[0],
              object_id: body.object_id ?? '',
              status: 'succeeded',
            }],
          },
        });
      } else {
        await route.fulfill({ json: { succeeded: body.mail_log_ids ?? [], failed: [] } });
      }
      return;
    }

    await route.continue();
  });
}

function lifecycleSSE(frames: Array<{ event: string; data: Record<string, unknown> }>): string {
  return frames
    .map((frame) => `event: ${frame.event}\ndata: ${JSON.stringify(frame.data)}\n\n`)
    .join('');
}

async function routeLifecycleLogStream(page: Page, retryURLs: string[], subject: string): Promise<void> {
  const messageUUID = '2540e741-0b50-4cf7-bbab-dc241df4e082';
  await page.route('**/api/v1/mail-logs/*/lifecycle-logs**', async (route) => {
    const url = new URL(route.request().url());
    const retryingPostfix = url.searchParams.get('modules') === 'postfix';
    if (retryingPostfix) retryURLs.push(url.toString());
    const frames = retryingPostfix
      ? [
          { event: 'start', data: { nodes: ['node-a'] } },
          { event: 'node_started', data: { node: 'node-a' } },
          { event: 'node_modules', data: { node: 'node-a', modules: ['postfix'] } },
          { event: 'module_done', data: {
            node: 'node-a', module: 'postfix', status: 'completed', total: 1,
            truncated: false, elapsed_ms: 24,
            items: [{
              event_uid: 'postfix-retry-1', message_uuid: messageUUID, node: 'node-a',
              component: 'postfix', event_time: '2026-08-19T08:00:02Z',
              raw_line: 'postfix retry completed',
            }],
          } },
          { event: 'node_done', data: { node: 'node-a', status: 'completed', elapsed_ms: 25 } },
          { event: 'done', data: {
            total: 1, truncated: false, partial: false, searched_nodes: ['node-a'],
            failed_nodes: [], elapsed_ms: 25,
          } },
        ]
      : [
          { event: 'start', data: { nodes: ['node-a', 'node-b'] } },
          { event: 'node_started', data: { node: 'node-a' } },
          { event: 'node_modules', data: { node: 'node-a', modules: ['antispam', 'postfix'] } },
          { event: 'module_done', data: {
            node: 'node-a', module: 'antispam', status: 'completed', total: 1,
            truncated: false, elapsed_ms: 18,
            items: [{
              event_uid: 'antispam-1', message_uuid: messageUUID, node: 'node-a',
              component: 'antispam', event_time: '2026-08-19T08:00:00Z',
              raw_line: subject,
            }],
          } },
          { event: 'module_timeout', data: {
            node: 'node-a', module: 'postfix', status: 'timed_out', items: [], total: 0,
            truncated: false, elapsed_ms: 8000, error_code: 'timeout',
          } },
          { event: 'node_done', data: { node: 'node-a', status: 'partial', elapsed_ms: 8001 } },
          { event: 'node_started', data: { node: 'node-b' } },
          { event: 'node_modules', data: { node: 'node-b', modules: ['antispam'] } },
          { event: 'module_done', data: {
            node: 'node-b', module: 'antispam', status: 'completed', total: 1,
            truncated: false, elapsed_ms: 20,
            items: [{
              event_uid: 'antispam-2', message_uuid: messageUUID, node: 'node-b',
              component: 'antispam', event_time: '2026-08-19T08:00:01Z',
              raw_line: 'node-b completed independently',
            }],
          } },
          { event: 'node_done', data: { node: 'node-b', status: 'completed', elapsed_ms: 21 } },
          { event: 'done', data: {
            total: 2, truncated: false, partial: true, searched_nodes: ['node-a', 'node-b'],
            failed_nodes: ['node-a'], elapsed_ms: 8001,
          } },
        ];
    await route.fulfill({
      status: 200,
      contentType: 'text/event-stream',
      headers: { 'Cache-Control': 'no-cache' },
      body: lifecycleSSE(frames),
    });
  });
}

async function openRow(page: Page, subject: string): Promise<Locator> {
  const row = await findRowBySubject(page, subject);
  expect(row, `expected to find a data row with subject "${subject}"`).not.toBeNull();
  await row!.click();
  const dialog = page.locator('[data-slot="sheet-content"]');
  await expect(dialog).toBeVisible({ timeout: 10000 });
  return dialog;
}

test.describe('Email Disposal Detail Drawer (DD-14)', () => {
  test.beforeEach(async ({ authenticatedPage }) => {
    await authenticatedPage.goto('/zh/email-disposal/center');
    await authenticatedPage.waitForLoadState('networkidle');
  });

  test('smoke: 80vw drawer, 3 anchor-nav sections with scroll-spy, closes via Escape and via close button', async ({ authenticatedPage, request }) => {
    const subject = `DD14 Smoke ${Date.now()}`;
    // Scroll-spy needs the content pane to actually be tall enough to
    // scroll -- a bare seed row's overview+analysis+rawlogs sections fit
    // within one viewport (nothing to scroll, scrollTop stays clamped at 0
    // and 'scroll' never fires), which silently no-ops the two manual
    // scrollTop assignments below. Seeding many recipient_dispositions
    // groups (one table row each) reliably pads the overview section past
    // one viewport height.
    const manyDispositions = Array.from({ length: 25 }, (_, i) => ({
      recipient: `dd14-smoke-${i}@testdomain.local`,
      final_action: 'sideline',
      status: 'quarantined',
      object_kind: 'quarantine',
      object_id: `dd14-smoke-obj-${i}`,
    }));
    await seedDetailRow(request, subject, { recipient_dispositions: manyDispositions });
    await authenticatedPage.reload({ waitUntil: 'networkidle' });

    const dialog = await openRow(authenticatedPage, subject);

    // Make every programmatic scroll instant. scrollToSection() uses
    // scrollIntoView({behavior:'smooth'}), whose animation would still be
    // running when the wheel gesture below fires — it then keeps scrolling
    // *after* the wheel clamped scrollTop to 0 and drags the pane back down, so
    // the scroll-spy reports the wrong section and the assertion fails for its
    // whole retry window. The animation's duration scales with the pane height,
    // so no fixed wait is safe; removing the animation removes the race itself.
    await authenticatedPage.addStyleTag({
      content: '*, *::before, *::after { scroll-behavior: auto !important; }',
    });

    // 80vw sheet.
    const cls = await dialog.getAttribute('class');
    expect(cls).toContain('w-[80vw]');

    // All 3 anchor-nav items visible with the exact DD-8 i18n labels.
    const nav = dialog.locator('nav');
    const overviewNav = nav.getByText('概览与处置', { exact: true });
    const analysisNav = nav.getByText('安全分析', { exact: true });
    const rawlogsNav = nav.getByText('原始日志', { exact: true });
    await expect(overviewNav).toBeVisible();
    await expect(analysisNav).toBeVisible();
    await expect(rawlogsNav).toBeVisible();

    // Initial active state: overview.
    const overviewBtn = nav.locator('button', { hasText: '概览与处置' });
    await expect(overviewBtn).toHaveClass(/border-primary/);

    // Clicking analysis nav updates the active-state class immediately.
    const analysisBtn = nav.locator('button', { hasText: '安全分析' });
    await analysisBtn.click();
    await expect(analysisBtn).toHaveClass(/border-primary/);
    await expect(overviewBtn).not.toHaveClass(/border-primary/);

    const rawlogsBtn = nav.locator('button', { hasText: '原始日志' });
    await rawlogsBtn.click();
    await expect(rawlogsBtn).toHaveClass(/border-primary/);
    // scrollToSection's scrollIntoView({behavior:'smooth'}) is still animating
    // right after the click resolves; it MUST finish before the wheel gesture
    // below, or the still-running animation keeps scrolling after the wheel has
    // clamped scrollTop to 0 and drags the pane back down to rawlogs — the
    // scroll-spy then reports rawlogs and the overview assertion fails for its
    // whole retry window. A fixed sleep is not enough: the animation's duration
    // scales with the distance, which grows with the seeded row's height. Poll
    // until scrollTop actually stops moving instead.
    // Belt-and-braces on top of the scroll-behavior override above: require
    // several CONSECUTIVE identical samples, not just two. A single comparison
    // can be fooled by an easing curve's plateau and report "settled" while the
    // animation is still running.
    const scrollerEl = dialog.locator('.overflow-y-auto').first();
    let lastTop = Number.NaN;
    let stableSamples = 0;
    await expect
      .poll(async () => {
        const top = await scrollerEl.evaluate((el) => el.scrollTop);
        stableSamples = top === lastTop ? stableSamples + 1 : 0;
        lastTop = top;
        return stableSamples;
      }, { timeout: 5000, intervals: [100] })
      .toBeGreaterThanOrEqual(3);

    // Scroll-spy: scrolling the content pane back to the top re-highlights
    // "overview" without clicking its nav item. A JS-driven `el.scrollTop =`
    // assignment (even paired with a manually dispatched 'scroll' Event)
    // proved unreliable at actually invoking detail-modal.tsx's
    // container.addEventListener('scroll', ...) listener in headless
    // Chromium -- page.mouse.wheel drives a real OS-level wheel gesture
    // instead, which the browser's native scroll implementation always
    // turns into a genuine 'scroll' event, matching real trackpad/wheel input.
    const scroller = dialog.locator('.overflow-y-auto').first();
    const box = (await scroller.boundingBox())!;
    await authenticatedPage.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await authenticatedPage.mouse.wheel(0, -100000); // large negative delta clamps to scrollTop=0
    // The wheel gesture itself is synchronous, but React's scroll-handler
    // state update (setActiveSection) needs a tick to flush before the
    // class change is observable -- without this, toHaveClass's own retry
    // polling can race the update and time out on the very first check.
    await authenticatedPage.waitForTimeout(200);
    await expect(overviewBtn).toHaveClass(/border-primary/, { timeout: 5000 });

    // Scrolling to the bottom re-highlights "rawlogs" (30%-threshold scroll-spy).
    await authenticatedPage.mouse.wheel(0, 100000); // large positive delta clamps to scrollTop=scrollHeight
    await authenticatedPage.waitForTimeout(200);
    await expect(rawlogsBtn).toHaveClass(/border-primary/, { timeout: 5000 });

    // Close via Escape.
    await authenticatedPage.keyboard.press('Escape');
    await expect(dialog).toBeHidden({ timeout: 5000 });

    // Reopen and close via the close ("X") button.
    const dialog2 = await openRow(authenticatedPage, subject);
    await dialog2.locator('[data-slot="sheet-close"]').click();
    await expect(dialog2).toBeHidden({ timeout: 5000 });
  });

  test('corrected badge shows original/current/source in its tooltip (route-intercepted state)', async ({ authenticatedPage, request }) => {
    const subject = `DD14 Corrected ${Date.now()}`;
    await seedDetailRow(request, subject);
    await authenticatedPage.reload({ waitUntil: 'networkidle' });

    await routeMailLogAPI(authenticatedPage, {
      detailOverride: (id) => mockDetail(id, subject, {
        email_type: 'normal',
        email_type_overridden: true,
        email_type_original: 'phishing',
        correction_source: 'admin_release',
      }),
    });

    const dialog = await openRow(authenticatedPage, subject);

    const badge = dialog.getByText('已纠正', { exact: true });
    await expect(badge).toBeVisible({ timeout: 10000 });

    await badge.hover();
    const tooltip = authenticatedPage.locator('[data-slot="tooltip-content"]');
    await expect(tooltip).toBeVisible({ timeout: 5000 });
    const tooltipText = (await tooltip.textContent()) ?? '';
    // mailTypeConfig's labelKey resolves against the *top-level*
    // emailDisposal.detail.mailType.* i18n bucket -- e.g. phishing: "钓鱼邮件",
    // normal: "正常" (zh.json); emailDisposal.detail.overview.mailType is a
    // DIFFERENT, unrelated bucket (just `{label: "邮件类型"}`, the row-1
    // section heading), not a second copy of these labels. Substring
    // `.toContain` below tolerates either short or long label text.
    expect(tooltipText).toContain('钓鱼'); // original (email_type_original: phishing)
    expect(tooltipText).toContain('正常'); // current (email_type: normal)
    expect(tooltipText).toContain('管理员放行'); // source (correction_source: admin_release)
  });

  test('GT-12977: final verdict card matches the current email type', async ({ authenticatedPage }) => {
    const subject = `GT-12977 Email Type ${Date.now()}`;

    // Keep this regression independent of the internal mTLS ingest endpoint:
    // mock the list row, detail and analysis responses at the browser boundary.
    await authenticatedPage.route('**/api/v1/mail-logs?**', async (route) => {
      await route.fulfill({
        json: {
          items: [mockDetail(12977, subject, {
            email_type: 'phishing',
            display_statuses: [{ status: 'quarantined', count: 1 }],
          })],
          total: 1,
          page: 1,
          page_size: 20,
          total_pages: 1,
        },
      });
    });

    // Pin the current mail type to phishing while the analysis endpoint still
    // returns the broad safe verdict.
    // The detail card must use the same email_type source as the overview and
    // disposal list, including any later administrator reclassification.
    await routeMailLogAPI(authenticatedPage, {
      detailOverride: (id) => mockDetail(id, subject, {
        email_type: 'phishing',
      }),
      analysisOverride: () => ({
        scope: 'all',
        final_verdict: 'safe',
        total_elapsed_ms: 10,
        stages: [{
          stage: 1,
          key: 'connection',
          status: 'pass',
          duration_ms: 10,
          checks: [],
        }],
      }),
      eventsOverride: () => ({ items: [] }),
    });
    await authenticatedPage.reload({ waitUntil: 'networkidle' });

    const dialog = await openRow(authenticatedPage, subject);
    const verdictCard = dialog.getByTestId('analysis-verdict-card');
    await expect(verdictCard).toContainText('最终判定：钓鱼邮件');
    await expect(verdictCard).not.toContainText('安全邮件');
  });

  test('GT-12596: policy-detail entry scrolls to a real basis target', async ({ authenticatedPage, request }, testInfo) => {
    const subject = `GT-12596 Policy Target ${Date.now()}`;
    await seedDetailRow(request, subject);
    await authenticatedPage.reload({ waitUntil: 'networkidle' });

    await routeMailLogAPI(authenticatedPage, {
      detailOverride: (id) => mockDetail(id, subject, {
        action: 'discard',
        status: 'discarded',
        recipient_dispositions: [{
          recipient: 'gt-12596@testdomain.local',
          final_action: 'discard',
          status: 'discarded',
        }],
        disposal_basis: {
          policy_key: 'SENDER',
          rule_id: 'SENDER-GT-12596',
          rule_name: 'GT-12596 blocked sender',
          action: 'discard',
        },
      }),
    });

    const dialog = await openRow(authenticatedPage, subject);
    const analysisVisible = await dialog.getByTestId('disposal-detail-analysis').count() > 0;

    await authenticatedPage.evaluate(() => {
      const state = window as typeof window & { __gt12596ScrollTargets?: string[] };
      state.__gt12596ScrollTargets = [];
      const original = Element.prototype.scrollIntoView;
      Element.prototype.scrollIntoView = function scrollIntoView(options?: boolean | ScrollIntoViewOptions) {
        state.__gt12596ScrollTargets?.push((this as HTMLElement).dataset.testid ?? '');
        original.call(this, options);
      };
    });

    const entry = dialog.getByTestId('email-disposal-overview-context-view-policy');
    await expect(entry).toBeVisible({ timeout: 10000 });
    await entry.click();

    await expect.poll(() => authenticatedPage.evaluate(() => {
      const state = window as typeof window & { __gt12596ScrollTargets?: string[] };
      return state.__gt12596ScrollTargets?.at(-1) ?? '';
    })).toBe(analysisVisible ? 'disposal-detail-analysis' : 'email-disposal-overview-disposal-basis');
    await expect(authenticatedPage.getByText('暂未实现', { exact: true })).toHaveCount(0);
    await authenticatedPage.screenshot({
      path: testInfo.outputPath(`gt-12596-${analysisVisible ? 'analysis' : 'overview'}-target.png`),
      fullPage: true,
    });
  });

  test('recall confirmation defaults the reclassify type to "spam"', async ({ authenticatedPage, request }) => {
    const subject = `DD14 Recall Default ${Date.now()}`;
    await seedDetailRow(request, subject, {
      recipient_dispositions: [
        { recipient: 'dd14-delivered@testdomain.local', final_action: 'deliver', status: 'delivered' },
      ],
    });
    await authenticatedPage.goto('/zh/email-disposal/center');
    // multiTenant:false makes RecipientStatus.readOnly false regardless of the
    // 'osg_viewer' cookie's default ('platform') — see overview-section.tsx's
    // `readOnly = viewer === 'platform' && !!capabilities?.multiTenant`. This
    // is the least-invasive way to get actionable buttons for this test
    // without touching global viewer state.
    await mockProductForm(authenticatedPage, 'ai-single', { ai: true, multiTenant: false, saas: false });

    const dialog = await openRow(authenticatedPage, subject);
    const recallBtn = dialog.getByRole('button', { name: '召回' });
    await expect(recallBtn).toBeEnabled({ timeout: 10000 });
    await recallBtn.click();

    const reclassify = authenticatedPage.locator('[data-slot="alert-dialog-content"]');
    await expect(reclassify).toBeVisible({ timeout: 5000 });
    const trigger = reclassify.locator('[data-slot="select-trigger"]');
    await expect(trigger).toContainText('垃圾邮件'); // mailTypeConfig.spam label — defaultType='spam' for recall

    await reclassify.getByRole('button', { name: '取消' }).click();
  });

  test('delivered recipient: "通知" sends a post-hoc security notice to that recipient', async ({ authenticatedPage, request }) => {
    const subject = `DD14 Notify ${Date.now()}`;
    const rcpt = 'dd14-notify-target@testdomain.local';
    await seedDetailRow(request, subject, {
      recipient_dispositions: [
        { recipient: rcpt, final_action: 'deliver', status: 'delivered' },
      ],
    });
    await authenticatedPage.goto('/zh/email-disposal/center');
    await mockProductForm(authenticatedPage, 'ai-single', { ai: true, multiTenant: false, saas: false });

    let capturedBody: Record<string, unknown> | null = null;
    await authenticatedPage.route('**/api/v1/mail-logs/*/notify', async (route) => {
      capturedBody = (route.request().postDataJSON() ?? {}) as Record<string, unknown>;
      await route.fulfill({ status: 204, body: '' });
    });

    const dialog = await openRow(authenticatedPage, subject);
    const notifyBtn = dialog.getByRole('button', { name: '通知' });
    await expect(notifyBtn).toBeEnabled({ timeout: 10000 });
    await notifyBtn.click();

    const confirm = authenticatedPage.locator('[data-slot="alert-dialog-content"]');
    await expect(confirm).toBeVisible({ timeout: 5000 });
    await expect(confirm).toContainText('确认发送安全提醒');
    await confirm.getByRole('button', { name: '确认' }).click();

    await expect.poll(() => capturedBody).not.toBeNull();
    expect(capturedBody).toEqual({ recipient: rcpt });
    await expect(authenticatedPage.getByText('操作成功')).toBeVisible({ timeout: 5000 });
  });

  test('recipient-group matrix: multi-object selection, bulk action, and the outgoing bulk-dispose request', async ({ authenticatedPage, request }) => {
    const subject = `DD14 Bulk Matrix ${Date.now()}`;
    await seedDetailRow(request, subject, {
      recipient_dispositions: [
        { recipient: 'dd14-g1@testdomain.local', final_action: 'sideline', status: 'quarantined', object_kind: 'quarantine', object_id: 'dd14-obj-1' },
        { recipient: 'dd14-g2@testdomain.local', final_action: 'sideline', status: 'quarantined', object_kind: 'quarantine', object_id: 'dd14-obj-2' },
      ],
    });
    await authenticatedPage.goto('/zh/email-disposal/center');
    await mockProductForm(authenticatedPage, 'ai-single', { ai: true, multiTenant: false, saas: false });

    const captured: CapturedRequest[] = [];
    await routeMailLogAPI(authenticatedPage, { capture: captured });

    const dialog = await openRow(authenticatedPage, subject);

    // Checkbox column only renders when there's more than one group.
    const groupCheckboxes = dialog.getByRole('checkbox', { name: /Select group/ });
    await expect(groupCheckboxes).toHaveCount(2, { timeout: 10000 });
    await groupCheckboxes.nth(0).click();
    await groupCheckboxes.nth(1).click();

    // recipientStatus.selected: "已选中 {n} 个收件人" (not "已选择 N 项").
    await expect(dialog.getByText('已选中 2 个收件人')).toBeVisible({ timeout: 5000 });

    // The bulk-bar's "投递" button is the last one in DOM order (two
    // per-row buttons render first, inside <Table>, then the bulk bar).
    await dialog.getByRole('button', { name: '投递' }).last().click();

    const reclassify = authenticatedPage.locator('[data-slot="alert-dialog-content"]');
    await expect(reclassify).toBeVisible({ timeout: 5000 });
    await expect(reclassify.locator('[data-slot="select-trigger"]')).toContainText('正常'); // defaultType='normal' for deliver
    await reclassify.getByRole('button', { name: '确认' }).click();

    await expect.poll(() => captured.length, { timeout: 10000 }).toBe(2);
    const objectIds = captured.map((c) => c.body.object_id).sort();
    expect(objectIds).toEqual(['dd14-obj-1', 'dd14-obj-2']);
    for (const c of captured) {
      expect(c.body.action).toBe('release');
      expect(c.body.final_type).toBe('normal');
      expect(c.body.mail_log_ids).toHaveLength(1);
    }

    // Sonner toasts portal to document root, not into the Sheet's own DOM
    // subtree -- assert page-wide, not scoped to `dialog`.
    await expect(
      authenticatedPage.getByText('操作成功').or(authenticatedPage.getByText(/成功.*失败/)),
    ).toBeVisible({ timeout: 5000 });
  });

  test('GT-12173: disposing from the drawer refreshes the underlying list, not just the drawer', async ({ authenticatedPage, request }) => {
    // Releasing a quarantined mail from inside the detail drawer must refresh
    // the list behind it -- before the fix, onRefetch only refetched the
    // drawer's own detail query, so the list row kept showing its stale
    // pre-release status ("投递中"/"隔离中") after the drawer closed.
    const subject = `GT12173 Release Refresh ${Date.now()}`;
    await seedDetailRow(request, subject, {
      recipient_dispositions: [
        { recipient: 'gt12173-rcpt@testdomain.local', final_action: 'sideline', status: 'quarantined', object_kind: 'quarantine', object_id: 'gt12173-obj-1' },
      ],
    });
    await authenticatedPage.goto('/zh/email-disposal/center');
    // multiTenant:false so the default (system_admin) viewer isn't normalized
    // to the platform-wide read-only scope that disables dispose actions.
    await mockProductForm(authenticatedPage, 'ai-single', { ai: true, multiTenant: false, saas: false });

    const captured: CapturedRequest[] = [];
    await routeMailLogAPI(authenticatedPage, { capture: captured });

    // Count GET /mail-logs?<query> (the list endpoint) fetches. The detail
    // (/mail-logs/<id>) and events (/mail-logs/<id>/events) GETs have a path
    // segment after mail-logs and no leading "?", so this regex isolates the
    // list query.
    let listFetches = 0;
    authenticatedPage.on('request', (req) => {
      if (req.method() === 'GET' && /\/mail-logs\?/.test(req.url())) listFetches += 1;
    });

    const dialog = await openRow(authenticatedPage, subject);
    const before = listFetches;

    // Single group -> a per-row "投递" (deliver) button; deliver opens the
    // reclassify dialog, then confirm fires the bulk-dispose (release).
    await dialog.getByRole('button', { name: '投递' }).first().click();
    const reclassify = authenticatedPage.locator('[data-slot="alert-dialog-content"]');
    await expect(reclassify).toBeVisible({ timeout: 5000 });
    await reclassify.getByRole('button', { name: '确认' }).click();

    await expect.poll(() => captured.length, { timeout: 10000 }).toBe(1);
    expect(captured[0].body.action).toBe('release');

    // The regression assertion: the dispose invalidated the list query, so a
    // fresh list GET fired. Before the fix this count stayed at `before`.
    await expect.poll(() => listFetches, { timeout: 10000 }).toBeGreaterThan(before);
  });

  test('recipient-group matrix: partial-failure batch dispose shows "N succeeded / M failed" and lists the failed recipient with its reason', async ({ authenticatedPage, request }) => {
    const subject = `DD14 Bulk Partial Failure ${Date.now()}`;
    await seedDetailRow(request, subject, {
      recipient_dispositions: [
        { recipient: 'dd14-ok@testdomain.local', final_action: 'sideline', status: 'quarantined', object_kind: 'quarantine', object_id: 'dd14-partial-ok' },
        { recipient: 'dd14-fail@testdomain.local', final_action: 'sideline', status: 'quarantined', object_kind: 'quarantine', object_id: 'dd14-partial-fail' },
      ],
    });
    await authenticatedPage.goto('/zh/email-disposal/center');
    await mockProductForm(authenticatedPage, 'ai-single', { ai: true, multiTenant: false, saas: false });

    // Unlike routeMailLogAPI's canned all-succeed response, this test needs
    // per-object_id differentiated results: one group's object_id fulfills
    // as succeeded, the other as failed with a reason, so the drawer's
    // partial-failure UX (spec §6.1 "N 成功 / M 失败") has something real to
    // render instead of always exercising the all-succeeded path every other
    // test in this file uses.
    const captured: CapturedRequest[] = [];
    await authenticatedPage.route('**/api/v1/mail-logs/**', async (route) => {
      const req = route.request();
      const parts = new URL(req.url()).pathname.split('/').filter(Boolean);
      const idx = parts.indexOf('mail-logs');
      const seg = parts[idx + 1];
      if (req.method() === 'POST' && seg === 'bulk-dispose') {
        const body = (req.postDataJSON() ?? {}) as Record<string, unknown>;
        captured.push({ url: req.url(), body });
        const isFailing = body.object_id === 'dd14-partial-fail';
        await route.fulfill({
          json: {
            results: [{
              mail_log_id: (body.mail_log_ids as number[])?.[0],
              object_id: body.object_id ?? '',
              status: isFailing ? 'failed' : 'succeeded',
              reason: isFailing ? 'delivery_failed' : undefined,
            }],
          },
        });
        return;
      }
      await route.continue();
    });

    const dialog = await openRow(authenticatedPage, subject);

    const groupCheckboxes = dialog.getByRole('checkbox', { name: /Select group/ });
    await expect(groupCheckboxes).toHaveCount(2, { timeout: 10000 });
    await groupCheckboxes.nth(0).click();
    await groupCheckboxes.nth(1).click();
    // recipientStatus.selected: "已选中 {n} 个收件人" (not "已选择 N 项").
    await expect(dialog.getByText('已选中 2 个收件人')).toBeVisible({ timeout: 5000 });

    await dialog.getByRole('button', { name: '投递' }).last().click();
    const reclassify = authenticatedPage.locator('[data-slot="alert-dialog-content"]');
    await expect(reclassify).toBeVisible({ timeout: 5000 });
    await reclassify.getByRole('button', { name: '确认' }).click();

    await expect.poll(() => captured.length, { timeout: 10000 }).toBe(2);

    // Toast: "1 成功 / 1 失败" (recipientStatus.bulkResult).
    await expect(authenticatedPage.getByText('1 成功 / 1 失败')).toBeVisible({ timeout: 5000 });

    // G6: per-recipient results now render inside a dedicated "操作完成"
    // modal (email-disposal-recipient-batch-result) instead of an inline
    // failures panel -- one row per recipient, success rows carry the new
    // status, failure rows carry the raw reason. The Dialog portals to
    // document root (like the AlertDialog/Sheet elsewhere in this file), so
    // assert page-wide rather than scoped to `dialog`.
    const resultModal = authenticatedPage.getByTestId('email-disposal-recipient-batch-result');
    await expect(resultModal).toBeVisible({ timeout: 5000 });
    await expect(resultModal.getByText('dd14-fail@testdomain.local')).toBeVisible();
    await expect(resultModal.getByText('delivery_failed')).toBeVisible();
  });

  test('platform-admin drill-down: recipient actions are disabled with an explanatory tooltip', async ({ authenticatedPage, request }) => {
    const subject = `DD14 ReadOnly ${Date.now()}`;
    await seedDetailRow(request, subject, {
      recipient_dispositions: [
        { recipient: 'dd14-ro@testdomain.local', final_action: 'sideline', status: 'quarantined', object_kind: 'quarantine', object_id: 'dd14-obj-ro' },
      ],
    });
    // Explicit combination per the brief: viewer-switcher.spec.ts's cookie-
    // write pattern (default is already 'platform' for a system_admin with
    // no cookie, but writing it explicitly documents the intent and is
    // robust against that default ever changing) + mockProductForm's
    // capabilities.multiTenant:true (also already the default 'cloud' form's
    // value). Together these drive readOnly = true in overview-section.tsx.
    await authenticatedPage.evaluate(() => {
      document.cookie = 'osg_viewer=platform; path=/; SameSite=Strict';
    });
    await mockProductForm(authenticatedPage, 'cloud', { ai: true, multiTenant: true, saas: true });

    const dialog = await openRow(authenticatedPage, subject);
    const deliverBtn = dialog.getByRole('button', { name: '投递' });
    const discardBtn = dialog.getByRole('button', { name: '丢弃' });
    await expect(deliverBtn).toBeDisabled({ timeout: 10000 });
    await expect(discardBtn).toBeDisabled({ timeout: 5000 });

    // Hover the TooltipTrigger's wrapping <span> rather than the disabled
    // button itself -- the span sits on top in the hit-test order (that's
    // exactly why recipient-status.tsx wraps disabled buttons in one), so
    // Playwright's actionability check on the button times out waiting for
    // "element receives pointer events" (the span always intercepts first).
    // Hover the button's direct parent (the TooltipTrigger's wrapping
    // element) rather than assuming a specific data-slot/attribute shape --
    // xpath=.. is robust regardless of exactly what base-ui renders there.
    const deliverWrapper = deliverBtn.locator('xpath=..');
    await deliverWrapper.hover();
    await expect(authenticatedPage.getByText('下钻视图仅供查看')).toBeVisible({ timeout: 5000 });
  });

  test('platform-admin drill-down (normalized): viewer=tenant with no selected tenant still disables detail actions', async ({ authenticatedPage, request }) => {
    const subject = `DD14 ReadOnlyNormalized ${Date.now()}`;
    await seedDetailRow(request, subject, {
      recipient_dispositions: [
        { recipient: 'dd14-ro2@testdomain.local', final_action: 'sideline', status: 'quarantined', object_kind: 'quarantine', object_id: 'dd14-obj-ro2' },
      ],
    });
    // review finding: a system_admin whose viewer cookie says 'tenant' but who
    // has NO selected tenant is exactly the inconsistent state
    // resolveSecurityScope() normalizes to platform-wide scope (see
    // security-scope.ts) -- the list page already reads this normalized
    // effectiveViewer, but the detail drawer used to re-derive readOnly from
    // the raw (non-normalized) viewer value and would leave dispose actions
    // enabled here. Explicitly clear osg_selected_tenant (belt-and-suspenders;
    // a fresh test-scoped browser context has no cookies to begin with).
    await authenticatedPage.evaluate(() => {
      document.cookie = 'osg_viewer=tenant; path=/; SameSite=Strict';
      document.cookie = 'osg_selected_tenant=; path=/; Max-Age=0';
      localStorage.removeItem('osgateway_selected_tenant');
    });
    await mockProductForm(authenticatedPage, 'cloud', { ai: true, multiTenant: true, saas: true });

    const dialog = await openRow(authenticatedPage, subject);
    const deliverBtn = dialog.getByRole('button', { name: '投递' });
    const discardBtn = dialog.getByRole('button', { name: '丢弃' });
    await expect(deliverBtn).toBeDisabled({ timeout: 10000 });
    await expect(discardBtn).toBeDisabled({ timeout: 5000 });

    const deliverWrapper = deliverBtn.locator('xpath=..');
    await deliverWrapper.hover();
    await expect(authenticatedPage.getByText('下钻视图仅供查看')).toBeVisible({ timeout: 5000 });
  });

  test('security-analysis module: 5-stage pipeline, expandable checks, AI verdict gated by capabilities.ai', async ({ authenticatedPage, request }) => {
    const subject = `DD14 Analysis ${Date.now()}`;
    await seedDetailRow(request, subject, {
      matched_action_rules: { rcpt: { ip_filter: [101] } },
      stage_timings: { connection: 120, identity: 45, content: 80, comprehensive: 30, ai: 15 },
    });
    await authenticatedPage.reload({ waitUntil: 'networkidle' });

    let dialog = await openRow(authenticatedPage, subject);
    await dialog.locator('nav').getByText('安全分析', { exact: true }).click();

    // Default form is 'cloud' (capabilities.ai=true) per docker-compose.yml — all 5 stages + AI verdict block render.
    // Stage cards carry data-testid="analysis-stage-{n}" on the card <button>
    // itself (the "-detail" suffix is on the inner detail <div>, not a button),
    // so this selector counts cards only.
    await expect(dialog.locator('button[data-testid^="analysis-stage-"]')).toHaveCount(5, { timeout: 10000 });
    await expect(dialog.getByText('AI 智能研判')).toBeVisible();

    // v2 gap 2.1: all 5 stage cards are expanded by DEFAULT (inline
    // hit-strategy detail already rendered, no click needed).
    const stage1Card = dialog.getByTestId('analysis-stage-1');
    await expect(dialog.getByTestId('analysis-stage-1-detail')).toBeVisible({ timeout: 10000 });
    await expect(dialog.getByText('IP 频率限制')).toBeVisible();

    // Clicking a card's own header toggles only that card's detail closed.
    await stage1Card.click();
    await expect(dialog.getByTestId('analysis-stage-1-detail')).not.toBeVisible();

    await authenticatedPage.keyboard.press('Escape');
    await expect(dialog).toBeHidden({ timeout: 5000 });

    // Switch to legacy-single (capabilities.ai=false): stage 5 + AI verdict block must not render at all.
    await mockProductForm(authenticatedPage, 'legacy-single', { ai: false, multiTenant: false, saas: false });
    dialog = await openRow(authenticatedPage, subject);
    await dialog.locator('nav').getByText('安全分析', { exact: true }).click();

    await expect(dialog.locator('button[data-testid^="analysis-stage-"]')).toHaveCount(4, { timeout: 10000 });
    await expect(dialog.getByText('AI 智能分析')).toHaveCount(0);
    await expect(dialog.getByText('AI 智能研判')).toHaveCount(0);
  });

  test('AI verdict block: threat-traceback timeline and recommended actions render from phish_agent_check (route-intercepted state)', async ({ authenticatedPage, request }) => {
    const subject = `DD14 AIVerdictTimeline ${Date.now()}`;
    await seedDetailRow(request, subject);
    await authenticatedPage.reload({ waitUntil: 'networkidle' });

    await routeMailLogAPI(authenticatedPage, {
      detailOverride: (id) => mockDetail(id, subject, {
        phish_agent_check: {
          status: 'completed',
          checked: true,
          verdict: 'malicious',
          risk_level: 'high',
          summary: 'credential harvesting page detected',
          confidence: 0.87,
          steps: [
            { name: 'fetch_url', status: 'completed', message: 'fetched landing page' },
            { name: 'sandbox_render', status: 'completed', message: 'rendered in sandbox, credential form detected' },
          ],
          recommended_actions: [
            { type: 'quarantine', scope: 'message', reason: 'credential phishing page' },
          ],
        },
      }),
    });

    const dialog = await openRow(authenticatedPage, subject);
    await dialog.locator('nav').getByText('安全分析', { exact: true }).click();

    // Headline badge must reflect risk_level=high (mapped to 高危), not
    // whatever cac_result derives to (mockDetail has none, which would
    // otherwise fall to 'none' -- confirming the badge is agent-derived).
    await expect(dialog.getByText('高危')).toBeVisible({ timeout: 10000 });

    await dialog.getByText('查看详情').click();
    // { exact: true } disambiguates from the raw-logs section's JSON dump of
    // the same mocked detail (all 3 drawer modules are mounted simultaneously
    // for scroll-spy, per DD-14's architecture) -- the JSON line renders the
    // same substrings wrapped in extra text (e.g. `"name": "fetch_url",`),
    // which only an exact match excludes.
    await expect(dialog.getByText('fetch_url', { exact: true })).toBeVisible({ timeout: 5000 });
    await expect(dialog.getByText('sandbox_render', { exact: true })).toBeVisible();
    await expect(dialog.getByText('rendered in sandbox, credential form detected', { exact: true })).toBeVisible();
    await expect(dialog.getByText('credential phishing page', { exact: true })).toBeVisible();
    await expect(dialog.getByText('暂无溯源')).toHaveCount(0);
    await expect(dialog.getByText('暂无建议')).toHaveCount(0);
  });

  test('AI verdict block: degrades to explicit empty state when phish agent has no steps/recommendations yet', async ({ authenticatedPage, request }) => {
    const subject = `DD14 AIVerdictEmpty ${Date.now()}`;
    await seedDetailRow(request, subject);
    await authenticatedPage.reload({ waitUntil: 'networkidle' });

    await routeMailLogAPI(authenticatedPage, {
      detailOverride: (id) => mockDetail(id, subject, {
        phish_agent_check: {
          status: 'processing',
          checked: true,
          verdict: '',
          risk_level: '',
          summary: '',
        },
      }),
    });

    const dialog = await openRow(authenticatedPage, subject);
    await dialog.locator('nav').getByText('安全分析', { exact: true }).click();
    await dialog.getByText('查看详情').click();

    await expect(dialog.getByText('暂无溯源')).toBeVisible({ timeout: 5000 });
    await expect(dialog.getByText('暂无建议')).toBeVisible();
  });

  test('raw-logs module: search highlighting, copy-all, and download', async ({ authenticatedPage, request, context }) => {
    const subject = `DD14RawLogsSearchToken ${Date.now()}`;
    await seedDetailRow(request, subject);
    await authenticatedPage.reload({ waitUntil: 'networkidle' });

    const retryURLs: string[] = [];
    await routeLifecycleLogStream(authenticatedPage, retryURLs, subject);

    const dialog = await openRow(authenticatedPage, subject);
    await dialog.locator('nav').getByText('原始日志', { exact: true }).click();
    await dialog.getByTestId('disposal-raw-logs-trigger').click();

    // A timed-out module remains isolated: both completed nodes stay visible,
    // and only node-a/postfix offers a targeted retry.
    await expect(dialog.getByTestId('raw-logs-count-badge')).toBeVisible({ timeout: 10000 });
    await expect(dialog.getByTestId('raw-logs-module-node-a-antispam')).toContainText('已完成 · 1 条');
    const postfixModule = dialog.getByTestId('raw-logs-module-node-a-postfix');
    await expect(postfixModule).toContainText('已超时');
    await expect(dialog.getByTestId('raw-logs-module-node-b-antispam')).toContainText('已完成 · 1 条');
    await expect(dialog.getByTestId('raw-logs-partial-warning')).toBeVisible();

    await postfixModule.getByRole('button', { name: '重试 postfix' }).click();
    await expect(postfixModule).toContainText('已完成 · 1 条');
    await expect(dialog.getByTestId('raw-logs-partial-warning')).toHaveCount(0);
    expect(retryURLs).toHaveLength(1);
    expect(new URL(retryURLs[0]).searchParams.get('node')).toBe('node-a');
    expect(new URL(retryURLs[0]).searchParams.get('modules')).toBe('postfix');

    // The completed antispam result remains searchable after the independent
    // postfix retry replaces only the postfix module's result.
    const searchInput = dialog.getByTestId('disposal-raw-logs-search');
    await searchInput.fill(subject);
    await expect(dialog.locator('mark').first()).toBeVisible({ timeout: 5000 });
    expect(await dialog.locator('mark').count()).toBeGreaterThan(0);
    await expect(dialog.getByTestId('disposal-raw-logs-found-count')).toContainText('找到 1 /');
    await expect(dialog.getByTestId('raw-log-line-1')).toContainText(subject);

    // Copy-all: grant clipboard perms and verify both the real clipboard
    // content and the button's own toggled state (Check icon + "已复制").
    // Asserted on the button itself, not page-wide getByText -- the Sonner
    // toast fires the identical "已复制" copy at the same moment (portaled
    // to document root), which would otherwise be a strict-mode ambiguity.
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    const copyBtn = dialog.getByTestId('disposal-raw-logs-copy');
    await copyBtn.click();
    await expect(copyBtn).toContainText('已复制', { timeout: 5000 });
    const clipboardText = await authenticatedPage.evaluate(() => navigator.clipboard.readText());
    expect(clipboardText).toContain(subject);

    // Download keeps the raw structured payload and deterministic filename.
    const downloadPromise = authenticatedPage.waitForEvent('download');
    await dialog.getByTestId('disposal-raw-logs-download').click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toMatch(/^email-log-\d+-\d{4}-\d{2}-\d{2}\.json$/);
  });

  test('4-locale switch (en/th/ru): drawer renders without error, no Chinese-character leakage', async ({ authenticatedPage, request }) => {
    const subject = `DD14 Locale ${Date.now()}`;
    await seedDetailRow(request, subject);

    const chinese = /[一-鿿]/;
    for (const locale of ['en', 'th', 'ru'] as const) {
      await authenticatedPage.goto(`/${locale}/email-disposal/center`);
      await authenticatedPage.waitForLoadState('networkidle');
      await authenticatedPage.waitForTimeout(1000);

      const row = await findRowBySubject(authenticatedPage, subject);
      expect(row, `[${locale}] expected to find the seeded row`).not.toBeNull();
      await row!.click();
      const dialog = authenticatedPage.locator('[data-slot="sheet-content"]');
      await expect(dialog, `[${locale}] drawer should open without error`).toBeVisible({ timeout: 10000 });

      const text = (await dialog.textContent()) ?? '';
      expect(text, `[${locale}] drawer text must not leak literal Chinese characters`).not.toMatch(chinese);

      await authenticatedPage.keyboard.press('Escape');
      await expect(dialog).toBeHidden({ timeout: 5000 });
    }
  });

  // GT-11913: the origin spec (design/origin/spec/0702邮件处置中心.md:130,170,186)
  // requires the operations column to carry an inline "查看" button alongside
  // "找相似"; only whole-row click was wired, so the affordance was invisible.
  test('GT-11913: operations column exposes an inline 查看 button that opens the drawer without selecting the row', async ({ authenticatedPage, request }) => {
    const subject = `GT11913 View Btn ${Date.now()}`;
    await seedDetailRow(request, subject);
    await authenticatedPage.reload({ waitUntil: 'networkidle' });

    const row = await findRowBySubject(authenticatedPage, subject);
    expect(row, `expected to find a data row with subject "${subject}"`).not.toBeNull();

    // Both inline actions live in the operations cell, per the origin spec.
    const viewBtn = row!.getByRole('button', { name: '查看' });
    await expect(viewBtn).toBeVisible();
    // NOTE: the row-level label is emailDisposal.table.findSimilar = 「找相似」.
    // 「查找相似」 is emailDisposal.batch.findSimilar — the batch-toolbar button,
    // which lives outside the row; using it here matched nothing.
    await expect(row!.getByRole('button', { name: '找相似' })).toBeVisible();
    // ...and only those two. GT-11584 had also put an inline 下载 here; the
    // 2026-07-18 html_spec alignment removed it (html_spec/
    // email-handling-disposal-center §列定义 row 9 specifies 查看 / 找相似).
    // EML download was not lost — it moved to the detail drawer
    // (「下载原文(eml)」, GET /mail-logs/:id/eml).
    await expect(row!.getByRole('button', { name: '下载' })).toHaveCount(0);

    const checkbox = row!.getByRole('checkbox');
    await expect(checkbox).not.toBeChecked();

    await viewBtn.click();

    const dialog = authenticatedPage.locator('[data-slot="sheet-content"]');
    await expect(dialog).toBeVisible({ timeout: 10000 });
    await expect(dialog).toContainText(subject);

    await authenticatedPage.keyboard.press('Escape');
    await expect(dialog).toBeHidden({ timeout: 5000 });

    // The operations cell stops propagation, so opening the drawer via the
    // button must not also toggle the row's selection checkbox. Asserted only
    // after the drawer closes -- while the Sheet is open it marks the
    // background inert, so the row checkbox is not exposed to the a11y tree.
    await expect(checkbox).not.toBeChecked();
  });

});
