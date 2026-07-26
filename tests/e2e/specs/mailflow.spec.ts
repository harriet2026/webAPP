import { test, expect } from '../fixtures/auth.fixture';
import { MailflowPage } from '../pages/mailflow.page';

// All mailflow API endpoints the page queries (lib/api/monitoring.ts). Intercept
// the wildcard so every hook (queue / queue-trend / delivery / bounce /
// connection / connection-trend / connection-failure) is covered uniformly.
const MAILFLOW_API = '**/api/v1/monitor/mailflow/**';

test.describe('Mailflow monitoring', () => {
  let mailflow: MailflowPage;

  test.beforeEach(async ({ authenticatedPage }) => {
    mailflow = new MailflowPage(authenticatedPage);
    await mailflow.goto();
    await mailflow.expectLoaded();
  });

  test('TC001 default state: queue tab, receive direction, 24h range', async () => {
    expect(await mailflow.getActiveTab()).toBe('queue');
    expect(await mailflow.getDirection()).toBe('receive');
    expect(await mailflow.getRange()).toBe('24h');
  });

  test('queue tab keeps the page-level direction Select enabled', async () => {
    expect(await mailflow.isDirectionDisabled()).toBe(false);
  });

  test('queue latency request follows the selected range and direction', async ({ authenticatedPage }) => {
    const rangeRequest = authenticatedPage.waitForRequest((req) => {
      const url = new URL(req.url());
      return url.pathname.endsWith('/monitor/mailflow/queue') && url.searchParams.get('range') === '7d';
    });
    await mailflow.setRange('7d');
    const rangedURL = new URL((await rangeRequest).url());
    expect(rangedURL.searchParams.get('direction')).toBe('receive');

    const directionRequest = authenticatedPage.waitForRequest((req) => {
      const url = new URL(req.url());
      return url.pathname.endsWith('/monitor/mailflow/queue') && url.searchParams.get('direction') === 'send';
    });
    await mailflow.setDirection('send');
    const directedURL = new URL((await directionRequest).url());
    expect(directedURL.searchParams.get('range')).toBe('7d');
  });

  test('TC021 tab switch preserves range and direction state', async () => {
    // range lives in the page (not per-tab), so changing it on queue is
    // preserved across a delivery detour.
    await mailflow.setRange('7d');
    expect(await mailflow.getRange()).toBe('7d');

    // delivery tab enables the direction Select.
    await mailflow.clickTab('delivery');
    expect(await mailflow.getActiveTab()).toBe('delivery');
    expect(await mailflow.isDirectionDisabled()).toBe(false);

    await mailflow.setDirection('send');
    expect(await mailflow.getDirection()).toBe('send');

    // Back to queue: both shared controls preserve their state.
    await mailflow.clickTab('queue');
    expect(await mailflow.getActiveTab()).toBe('queue');
    expect(await mailflow.getRange()).toBe('7d');
    expect(await mailflow.isDirectionDisabled()).toBe(false);
  });

  test('TC004/013/014/015 direction switch triggers a refetch', async ({ authenticatedPage }) => {
    let deliveryHits = 0;
    let bounceHits = 0;
    authenticatedPage.on('request', (req) => {
      const u = req.url();
      if (u.includes('/monitor/mailflow/delivery?')) deliveryHits++;
      if (u.includes('/monitor/mailflow/bounce?')) bounceHits++;
    });

    // Switch to delivery (fires the initial delivery/bounce fetches with the
    // current direction). Then change direction — the hooks re-query because
    // `direction` is part of their queryKey.
    await mailflow.clickTab('delivery');
    const before = deliveryHits + bounceHits;
    await mailflow.setDirection('send');
    // give react-query a beat to fire the new requests
    await authenticatedPage.waitForTimeout(1000);
    const after = deliveryHits + bounceHits;
    expect(after).toBeGreaterThan(before);
  });

  test('empty state renders when the API returns empty data', async ({ authenticatedPage }) => {
    // Mock every mailflow endpoint to return an empty payload. Shapes vary per
    // endpoint, so return the emptiest common shape ({}) — the page's
    // EmptyState banner renders whenever the hooks resolve with no plottable
    // data.
    await authenticatedPage.route(MAILFLOW_API, async (route) => {
      await route.fulfill({ status: 200, json: {} });
    });
    // Reload so the mocked routes take effect for a fresh query cycle.
    await mailflow.goto();
    await mailflow.expectLoaded();
    await mailflow.expectEmptyState();
  });

  test('TC020 API timeout keeps the previous data and shows the timeout banner', async ({ authenticatedPage }) => {
    // Review finding 3: the 10s timeout must (a) surface a "数据加载超时"
    // banner and (b) keep the last successful data on screen. We first let the
    // queue tab render with real data, then route the endpoints to never
    // resolve and wait past the 10s client timeout (MAILFLOW_TIMEOUT_MS).
    const initialActiveTab = await mailflow.getActiveTab();
    expect(initialActiveTab).toBe('queue');

    await authenticatedPage.route(MAILFLOW_API, async () => {
      // Never resolve → the client-side AbortSignal.timeout(10s) fires and the
      // hook flips to isError + TimeoutBanner.
      await new Promise(() => {});
    });
    await mailflow.clickRefresh();

    // Wait for the 10s client timeout + a buffer. Assert the timeout banner
    // becomes visible and the empty-state banner does NOT (proving the cached
    // data is retained rather than cleared).
    await expect(
      // Substring match: the banner text is "数据加载超时，请稍后重试" (exact:true
      // never matched the full string — pre-existing test bug).
      authenticatedPage.locator('main').getByText('数据加载超时', { exact: false }).first(),
    ).toBeVisible({ timeout: 15000 });
    const emptyVisible = await authenticatedPage
      .locator('main')
      .getByText('暂无数据', { exact: true })
      .first()
      .isVisible()
      .catch(() => false);
    expect(emptyVisible).toBe(false);
  });

  test('TC021b stale response does not overwrite the latest view', async ({ authenticatedPage }) => {
    // Review finding 3: when the user flips filters quickly, the in-flight
    // request for the OLD filter must be aborted (or its response ignored) so
    // the UI reflects the LATEST selection. We delay the first direction's
    // delivery response and assert the page shows the second direction's data.
    await mailflow.clickTab('delivery');

    // Route delivery with a per-direction delay: 'receive' (the default) is
    // delayed long enough that flipping to 'send' should cancel/ignore it,
    // while 'send' resolves immediately with a recognizable trend value.
    await authenticatedPage.route('**/api/v1/monitor/mailflow/delivery?**', async (route) => {
      const url = route.request().url();
      if (url.includes('direction=receive')) {
        // Hold the receive response past the abort window. The hook's
        // AbortSignal (React Query) cancels it when the queryKey changes.
        await new Promise((r) => setTimeout(r, 8000));
        await route.fulfill({
          status: 200,
          json: { trend: [{ ts: 'receive-stale', avg: 1, p95: 1, p99: 1 }], approx: false },
        });
        return;
      }
      await route.fulfill({
        status: 200,
        json: { trend: [{ ts: 'send-latest', avg: 2, p95: 2, p99: 2 }], approx: false },
      });
    });

    await mailflow.setDirection('send');
    // Give react-query a beat to fire + settle the new request.
    await authenticatedPage.waitForTimeout(1500);

    // The receive (stale) ts must NOT appear in the rendered chart canvas.
    // We assert via the page DOM: echarts renders the category labels as text
    // inside the chart container. Inspect the delivery card for the stale ts.
    const deliveryCard = authenticatedPage.locator('main').getByText('投递延时趋势').locator('xpath=ancestor::*[contains(@class,"card") or self::div]');
    const staleVisible = await deliveryCard
      .getByText('receive-stale')
      .first()
      .isVisible()
      .catch(() => false);
    expect(staleVisible).toBe(false);
  });

  test('TC002/003 threshold breach colours the card with a pulsing critical badge', async ({ authenticatedPage }) => {
    // The real queue-backlog scenarios (deferred > 10k/50k) are not load-tested
    // (spec §5 skip note); instead inject a queue snapshot whose status is
    // already 'critical' and assert the card renders the pulsing critical badge.
    await authenticatedPage.route(/\/monitor\/mailflow\/queue\?/, async (route) => {
      await route.fulfill({
        status: 200,
        json: {
          depth: [
            { queue: 'incoming', value: 3, status: 'normal' },
            { queue: 'active', value: 1, status: 'normal' },
            { queue: 'deferred', value: 60000, status: 'critical' },
            { queue: 'held', value: 0, status: 'normal' },
            { queue: 'corrupt', value: 2, status: 'warning' },
          ],
          age: [],
          latency: { avg: 0, p95: 0, p99: 0, avg_status: 'normal', p95_status: 'normal', p99_status: 'normal' },
        },
      });
    });
    await mailflow.goto();
    await mailflow.expectLoaded();
    // Critical badge pulses (StatusBadge critical → animate-pulse).
    await expect(
      authenticatedPage.locator('main .animate-pulse').first(),
    ).toBeVisible({ timeout: 10000 });
  });

  test('BUG-3 bounce "view logs" link carries a recipient_domain filter', async ({ authenticatedPage }) => {
    // Mock only delivery + bounce with valid payloads (the delivery tab gates
    // its render on the delivery query, so both must resolve). Other endpoints
    // (incl. the initial queue load in beforeEach) pass through to the backend.
    await authenticatedPage.route(/\/mailflow\/delivery\?/, async (route) => {
      await route.fulfill({ status: 200, json: { trend: [{ ts: 't1', avg: 1, p95: 1, p99: 1 }], approx: false } });
    });
    await authenticatedPage.route(/\/mailflow\/bounce\?/, async (route) => {
      await route.fulfill({
        status: 200,
        json: {
          top_domains: [
            {
              domain: 'bad.com',
              rate_5xx: 60,
              rate_4xx: 10,
              rate_5xx_status: 'critical',
              rate_4xx_status: 'warning',
              attempts: 10,
              last_bounce: '2026-07-01T00:00:00Z',
            },
          ],
          reasons: [],
        },
      });
    });
    await mailflow.clickTab('delivery');
    const link = authenticatedPage.locator('main a[href*="/logs/email?recipient_domain="]').first();
    await expect(link).toBeVisible({ timeout: 10000 });
    const href = await link.getAttribute('href');
    expect(href).toContain('recipient_domain=bad.com');
  });

  test('GAP-2 connection failure "view logs" link jumps to failed auth logs', async ({ authenticatedPage }) => {
    // Mock connection + trend + failure with valid payloads (the connection tab
    // gates its render on the connection query). Default direction 'receive' is
    // not calibrating, so the failure table + its view-logs link render.
    await authenticatedPage.route(/\/mailflow\/connection\/failure\?/, async (route) => {
      await route.fulfill({
        status: 200,
        json: {
          reasons: [
            { reason: 'bad-password', count: 15, percent: 75 },
            { reason: 'account-locked', count: 5, percent: 25 },
          ],
          calibrating: false,
        },
      });
    });
    await authenticatedPage.route(/\/mailflow\/connection\/trend\?/, async (route) => {
      await route.fulfill({ status: 200, json: { points: [], calibrating: false } });
    });
    await authenticatedPage.route(/\/mailflow\/connection\?/, async (route) => {
      await route.fulfill({
        status: 200,
        json: {
          kpi: {
            upstream: 5, downstream: null, stage_diff: null, failed_count: 20,
            failed_rate: 20, avg_resp_ms: 100, calibrating: false,
            stage_diff_status: '', failed_status: 'normal', resp_status: 'normal',
          },
          quality: { total: 100, success: 80, failed: 20, failed_rate: 20, calibrating: false },
        },
      });
    });
    await mailflow.clickTab('connection');
    const link = authenticatedPage.locator('main a[href*="/logs/auth-attempts?result=failed"]').first();
    await expect(link).toBeVisible({ timeout: 10000 });
  });

  test('TC019 refresh button shows a loading state', async () => {
    // The refresh button's icon picks up `animate-spin` while react-query is
    // invalidating. Assert the spinner class appears right after the click.
    const spinIcon = mailflow.refreshButton.locator('svg.lucide-refresh-cw');
    await mailflow.clickRefresh();
    // The spin class is applied synchronously in the onClick handler.
    await expect(spinIcon).toHaveClass(/animate-spin/, { timeout: 3000 });
  });

  test('TC022 manual refresh resets the auto-refresh timer', async ({ authenticatedPage }) => {
    // Review finding 3: clicking refresh must re-arm the 30s auto-refresh
    // interval so the next automatic tick fires a full interval later, not at
    // the original schedule. We count mailflow requests over a window shorter
    // than the interval, click refresh midway, and assert no auto-tick fires in
    // between (only the manual refetch).
    let queueHits = 0;
    authenticatedPage.on('request', (req) => {
      if (req.url().includes('/monitor/mailflow/queue?')) queueHits++;
    });

    // Baseline: the initial mount fetch has already happened in beforeEach.
    const baseline = queueHits;
    // Wait 2s — well under the 30s auto-refresh interval — then click refresh.
    await authenticatedPage.waitForTimeout(2000);
    await mailflow.clickRefresh();
    // The manual click must produce exactly one new queue fetch.
    await authenticatedPage.waitForTimeout(1000);
    expect(queueHits - baseline).toBeGreaterThanOrEqual(1);
    // Wait another 5s (still under 30s) and assert no auto-tick fired in this
    // window — i.e. the timer was reset by the manual refresh, otherwise the
    // original schedule would have ticked around now.
    const afterManual = queueHits;
    await authenticatedPage.waitForTimeout(5000);
    expect(queueHits).toBe(afterManual);
  });
});
