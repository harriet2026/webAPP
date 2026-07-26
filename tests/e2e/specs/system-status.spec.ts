import { test, expect } from '../fixtures/auth.fixture';
import { SystemStatusPage } from '../pages/system-status.page';

// System-status dashboard (`/zh/dashboard`, Plan Task 8 + html_spec alignment)
// — matrix visibility + range refetch + threat-trend legend toggle +
// core-source (security-overview) failure degradation.
//
// Viewer/form switching follows the SAME mechanism established by
// product-form-switcher.spec.ts (product-form dropdown, `osg_form_override`
// cookie) and viewer-switcher.spec.ts (登录视角 menu section inside the same
// dropdown, `osg_viewer` + `osg_selected_tenant` cookies) — this spec does not
// invent a new switching path. Pre-conditions shared with those specs:
//   - OSGATEWAY_PRODUCT_FORM_SWITCHER=true (switcher visible)
//   - OSG_PRODUCT_FORM=cloud               (initial form = cloud)
//   - default user is admin/admin123 (system_admin)

const API_BASE = process.env.PLAYWRIGHT_API_BASE_URL || 'http://localhost:18080';

const FORM_LABELS = {
  cloud: '云网关',
  aiMulti: 'AI版·多租户',
  aiSingle: 'AI版·单租户',
  legacyMulti: '传统版·多租户',
  legacySingle: '传统版·单租户',
} as const;

const VIEWER_LABELS = {
  platform: '平台管理员',
  tenant: '租户管理员',
} as const;

const switcherTrigger = (page: import('@playwright/test').Page) => page.getByRole('button', { name: /^产品形态/ });

async function switchForm(page: import('@playwright/test').Page, label: string) {
  await switcherTrigger(page).click();
  await page.getByRole('menuitem', { name: label }).click();
  await page.waitForTimeout(400);
}

async function switchViewerToTenant(page: import('@playwright/test').Page) {
  await switcherTrigger(page).click();
  await page.getByRole('menuitem', { name: VIEWER_LABELS.tenant }).click();
  await page.waitForTimeout(400);
}

// 只清 viewer/form 相关 cookie，保留登录态 —— 与 viewer-switcher.spec.ts 同策略
// （osgateway_token 是 HttpOnly，document.cookie 操作不会碰到它）。Playwright
// 默认每个 test 一个新 context，这里仅作双重保险。
async function resetSwitcherCookies(page: import('@playwright/test').Page) {
  await page.evaluate(() => {
    document.cookie = 'osg_viewer=; path=/; Max-Age=0';
    document.cookie = 'osg_selected_tenant=; path=/; Max-Age=0';
    document.cookie = 'osg_form_override=; path=/; Max-Age=0';
    localStorage.removeItem('osgateway_selected_tenant');
  });
}

async function adminToken(): Promise<string> {
  const r = await fetch(`${API_BASE}/api/v1/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'admin', password: 'admin123' }),
  });
  if (!r.ok) throw new Error(`admin login failed: ${r.status}`);
  return (await r.json()).token as string;
}

// These tenant-viewer cases need a tenant that is BOTH:
//   * active -- a `pending` tenant is dropped, the selection never sticks, the
//     viewer normalizes back to 'platform' (security-scope.ts) and the page
//     still fires /monitor/*; and
//   * WITHOUT AI capability grants -- the assertions below require the agent
//     rows to be hidden, and grants make them render.
// items[0] satisfied neither reliably: the list is not id-ordered, so once a
// Python E2E run leaves hundreds of tenants behind it is an arbitrary leftover
// (observed: a `pending` one). global-setup's default tenant is no good either
// -- that is exactly the one it GRANTS the AI capabilities to.
async function firstTenantId(token: string): Promise<number | null> {
  const r = await fetch(`${API_BASE}/api/v1/tenants?page_size=100`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!r.ok) return null;
  const body = await r.json();
  const usable = (body.items ?? []).filter(
    (t: { status?: string; capability_flags?: string[] | null }) =>
      t.status === 'active' && !(t.capability_flags ?? []).length,
  );
  if (!usable.length) return null;
  return usable.reduce((lo: { id: number }, t: { id: number }) => (t.id < lo.id ? t : lo)).id;
}

// Mirrors viewer-switcher.spec.ts's setSelectedTenantCookie: simulate the
// TenantSelector's write + reload so AuthContext hydrates selectedTenantId.
async function setSelectedTenantCookie(page: import('@playwright/test').Page, tenantId: number) {
  await page.evaluate((id) => {
    document.cookie = `osg_selected_tenant=${id}; path=/; SameSite=Strict`;
    localStorage.setItem('osgateway_selected_tenant', String(id));
    // Write the viewer in the SAME step. Two constraints pin this down:
    //   * GT-12245's reconciliation (product-form-context.tsx) clears the tenant
    //     selection on hydration while viewer === 'platform' -- so setting the
    //     tenant alone does not survive the reload below.
    //   * The switcher cannot be used to fix that up afterwards: with no tenant
    //     selected, handleSwitchViewer('tenant') opens the tenant-picker DIALOG
    //     instead of switching (product-form-switcher.tsx), so the viewer stays
    //     platform. Ordering the two calls the other way round does not help.
    // Both cookies together mean hydration sees viewer=tenant AND a selection,
    // which is also what resolveSecurityScope requires before it stops
    // normalizing the viewer back to 'platform' (security-scope.ts).
    document.cookie = 'osg_viewer=tenant; path=/; SameSite=Strict';
  }, tenantId);
  await page.reload();
  await page.waitForLoadState('networkidle');
}

// ─── Group 1: Platform / AI viewer ─────────────────────────────────────────
//
// The page-level `showAgents` gate is just `capabilities.ai`, but each
// agent-overview row is ALSO gated per-row via resolve('phishing-detection',
// ...) etc, which are `platformHidden: true` — under a MULTI-tenant AI form
// (cloud/ai-multi), a *platform* viewer resolves those rows HIDDEN (see
// visibility.ts's own doc comment), so the agents card would render null
// there. The single-tenant AI form (AI版·单租户) is the one config where a
// platform-viewer sees agents (multiTenant=false bypasses the
// platformHidden branch entirely) — this is the "platform admin, AI form"
// case the plan means by 平台/AI 视角.
test.describe('System status — platform/AI viewer (single-tenant AI form)', () => {
  test.beforeEach(async ({ authenticatedPage }) => {
    await resetSwitcherCookies(authenticatedPage);
    await switchForm(authenticatedPage, FORM_LABELS.aiSingle);
  });

  test('shows 4 KPI cards + node card + agents card + health card', async ({ authenticatedPage }) => {
    const sp = new SystemStatusPage(authenticatedPage);
    await sp.expectLoaded();

    await expect(sp.kpiCards).toHaveCount(4, { timeout: 10000 });
    await expect(sp.nodeCard).toBeVisible();
    await expect(sp.agentsCard).toBeVisible({ timeout: 10000 });
    await expect(sp.healthCard).toBeVisible();
  });

  test('switching time range triggers a refetch with a new date range', async ({ authenticatedPage }) => {
    const sp = new SystemStatusPage(authenticatedPage);
    await sp.expectLoaded();

    // 威胁态势趋势 sources its data from /statistics/security-overview
    // (trend.threat_type), which the range selector refetches for the new
    // date window (the old /statistics/type email-type source was removed in
    // the html_spec alignment).
    const reqPromise = authenticatedPage.waitForRequest(
      (r) => r.url().includes('/api/v1/statistics/security-overview'),
      { timeout: 10000 },
    );
    await sp.selectRange('最近 30 天');
    const req = await reqPromise;
    expect(req.url()).toContain('/statistics/security-overview');
    expect(new URL(req.url()).searchParams.get('interval')).toBe('day');
  });

  test('clicking a trend legend entry hides that series', async ({ authenticatedPage }) => {
    // Run in Mock mode so the dispatcher serves the demo-parity 5-series threat
    // trend (deterministic, non-empty) — the real dev stack may have no threat
    // buckets in range, which would render the chart's empty state and leave no
    // legend to click.
    await authenticatedPage.addInitScript(() => localStorage.setItem('osgateway_mock_enabled', '1'));

    const sp = new SystemStatusPage(authenticatedPage);
    await sp.goto();
    await sp.expectLoaded();

    const phishingLegend = sp.legendButton('phishing');
    await expect(phishingLegend).toBeVisible({ timeout: 10000 });

    // Demo structure: legend sits above the chart with no enclosing panel.
    const legend = authenticatedPage.getByTestId('system-status-trend-legend');
    const chart = authenticatedPage.getByTestId('system-status-trend-chart');
    const [legendBox, chartBox] = await Promise.all([legend.boundingBox(), chart.boundingBox()]);
    expect(legendBox).not.toBeNull();
    expect(chartBox).not.toBeNull();
    expect(chartBox!.y - (legendBox!.y + legendBox!.height)).toBeGreaterThanOrEqual(20);
    expect(
      await legend.evaluate((node) => {
        const style = getComputedStyle(node);
        return {
          borderTopWidth: style.borderTopWidth,
          padding: style.padding,
          justifyContent: style.justifyContent,
          marginBottom: style.marginBottom,
        };
      }),
    ).toEqual({
      borderTopWidth: '0px',
      padding: '0px',
      justifyContent: 'normal',
      marginBottom: '20px',
    });

    // Shown by default — full opacity, aria-pressed true.
    await expect(phishingLegend).not.toHaveClass(/opacity-40/);
    await expect(phishingLegend).toHaveAttribute('aria-pressed', 'true');

    await phishingLegend.click();

    await expect(phishingLegend).toHaveClass(/opacity-40/);
    await expect(phishingLegend).toHaveAttribute('aria-pressed', 'false');
  });
});

test('system-status threat trend paints a single non-zero hourly bucket', async ({ authenticatedPage }) => {
  // A sparse day can still contain only one non-zero hourly bucket. A line
  // series with `symbol: none` has no segment or point to paint in that case,
  // so the single-point fallback must remain a bar.
  let overviewRequestUrl = '';
  await authenticatedPage.route('**/api/v1/statistics/security-overview?*', async (route) => {
    overviewRequestUrl = route.request().url();
    const point = {
      date: '2026-07-24 14:00:00',
      total: 6522,
      block_rate: 100,
      change: null,
      phishing: 2413,
      spoofing: 0,
      spam: 4109,
      virus: 0,
      malicious: 0,
    };
    const trend = {
      threat_type: [point],
      action: [],
      delivery_result: [],
      email_type: [],
    };
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        kpi: {
          total_filtered: 6522,
          total_filtered_delta: null,
          block_rate: 100,
          block_rate_delta: null,
          recall_rate: 0,
          recall_rate_delta: null,
          pending_review: 0,
          pending_review_delta: null,
          blocked: 6522,
        },
        distribution: [],
        trend,
        trend_previous: null,
        trend_previous_period: null,
        detail_table: trend,
      }),
    });
  });

  const sp = new SystemStatusPage(authenticatedPage);
  await sp.goto();
  await sp.expectLoaded();
  expect(new URL(overviewRequestUrl).searchParams.get('interval')).toBe('hour');

  const chart = authenticatedPage.getByTestId('system-status-trend-chart');
  await expect(chart).toHaveAttribute('data-render-mode', 'single-bucket-bar');
  const canvas = chart.locator('canvas').first();
  await expect(canvas).toBeVisible();
  await authenticatedPage.waitForTimeout(500);

  // Inspect only the ECharts canvas (the HTML legend also uses these colors).
  // Non-trivial red/yellow pixel coverage proves the mocked non-zero values
  // were actually painted, rather than merely present in a tooltip.
  const threatColorPixels = await canvas.evaluate((node: HTMLCanvasElement) => {
    const context = node.getContext('2d', { willReadFrequently: true });
    if (!context) return 0;
    const pixels = context.getImageData(0, 0, node.width, node.height).data;
    let count = 0;
    for (let i = 0; i < pixels.length; i += 4) {
      const red = pixels[i];
      const green = pixels[i + 1];
      const blue = pixels[i + 2];
      const isPhishingRed = red > 200 && green < 120 && blue < 120;
      const isSpamYellow = red > 180 && green > 120 && green < 220 && blue < 80;
      if (isPhishingRed || isSpamYellow) count += 1;
    }
    return count;
  });
  expect(threatColorPixels).toBeGreaterThan(100);
});

test('system-status KPI cards match the demo single-content layout', async ({ authenticatedPage }) => {
  const grid = authenticatedPage.getByTestId('system-status-kpi-grid');
  await expect(grid).toBeVisible();

  const cards = grid.locator(':scope > a [data-slot="card"]');
  const cardCount = await cards.count();
  expect(cardCount).toBeGreaterThanOrEqual(3);

  // The demo has one CardContent block per KPI. CardFooter would add the
  // unwanted grey band and top divider that caused the visual mismatch.
  await expect(grid.locator('[data-slot="card-footer"]')).toHaveCount(0);
  await expect(grid.locator('[data-slot="card-content"]')).toHaveCount(cardCount);

  const metrics = await cards.evaluateAll((nodes) =>
    nodes.map((card) => {
      const rect = card.getBoundingClientRect();
      const style = getComputedStyle(card);
      const content = card.querySelector<HTMLElement>('[data-slot="card-content"]');
      const cta = card.querySelector<HTMLElement>('[data-testid^="system-status-kpi-cta-"]');
      return {
        height: rect.height,
        radius: style.borderRadius,
        paddingTop: style.paddingTop,
        contentPadding: content ? getComputedStyle(content).padding : '',
        ctaTop: cta?.getBoundingClientRect().top ?? 0,
      };
    }),
  );

  expect(Math.max(...metrics.map((m) => m.height)) - Math.min(...metrics.map((m) => m.height))).toBeLessThan(0.5);
  expect(Math.max(...metrics.map((m) => m.ctaTop)) - Math.min(...metrics.map((m) => m.ctaTop))).toBeLessThan(0.5);
  for (const metric of metrics) {
    expect(metric.radius).toBe('12px');
    expect(metric.paddingTop).toBe('24px');
    expect(metric.contentPadding).toBe('20px');
  }
});

// ─── Group 2: Tenant viewer ─────────────────────────────────────────────────
//
// ai-multi (multiTenant=true, ai=true, saas=false) is deliberately chosen
// over cloud: with saas=false, an ungranted grantable feature resolves fully
// HIDDEN for a tenant viewer (resolve.ts); under `saas: true` (cloud) the
// same ungranted feature resolves `visible:true, locked:true` instead (an
// upsell row, not a hidden one) — so cloud would not exercise the "agents
// hidden when ungranted" branch this test is after.
test.describe('System status — tenant viewer', () => {
  test('node card, health card, agents (ungranted) hidden; KPI collapses to 3; no view-all-alerts link', async ({
    authenticatedPage,
  }) => {
    const token = await adminToken();
    const tenantId = await firstTenantId(token);
    if (tenantId == null) {
      test.skip(true, 'no tenant exists — global-setup should have seeded one');
      return;
    }

    await resetSwitcherCookies(authenticatedPage);
    await switchForm(authenticatedPage, FORM_LABELS.aiMulti);
    await setSelectedTenantCookie(authenticatedPage, tenantId);
    await switchViewerToTenant(authenticatedPage);

    const sp = new SystemStatusPage(authenticatedPage);
    await sp.expectLoaded();

    await expect(sp.kpiCards).toHaveCount(3, { timeout: 10000 });
    await expect(sp.nodeCard).toHaveCount(0);
    await expect(sp.healthCard).toHaveCount(0);
    await expect(sp.agentsCard).toHaveCount(0);
    await expect(sp.viewAllAlertsLink).toHaveCount(0);
  });

  // Core data-isolation invariant (spec §4.6 / decision #20): the tenant viewer
  // must NEVER call the adminOnly /monitor/* endpoints (nodes/alerts) — the
  // backend RequireSystemAdmin would 403, and card visibility must stay in
  // lockstep with the request scope. Assert zero /monitor/* requests are made
  // while the dashboard loads and renders under the tenant viewer.
  test('tenant viewer makes no /monitor/* requests', async ({ authenticatedPage }) => {
    const token = await adminToken();
    const tenantId = await firstTenantId(token);
    if (tenantId == null) {
      test.skip(true, 'no tenant exists — global-setup should have seeded one');
      return;
    }

    await resetSwitcherCookies(authenticatedPage);
    await switchForm(authenticatedPage, FORM_LABELS.aiMulti);
    await setSelectedTenantCookie(authenticatedPage, tenantId);
    await switchViewerToTenant(authenticatedPage);

    // Attach the listener before the fresh dashboard load so we capture every
    // request the data hooks fire.
    const monitorRequests: string[] = [];
    authenticatedPage.on('request', (req) => {
      const path = new URL(req.url()).pathname;
      if (path.includes('/monitor/')) {
        monitorRequests.push(path);
      }
    });

    const sp = new SystemStatusPage(authenticatedPage);
    await sp.goto();
    await sp.expectLoaded();
    // Give any lazy hook fetches a beat to fire (they wouldn't, under tenant).
    await authenticatedPage.waitForLoadState('networkidle');

    expect(monitorRequests, `tenant viewer must not call /monitor/*, saw: ${monitorRequests.join(', ')}`).toEqual([]);
  });
});

// ─── Group 3: Traditional (non-AI) product form ────────────────────────────
test.describe('System status — traditional (non-AI) product form', () => {
  test('agent-overview section does not render', async ({ authenticatedPage }) => {
    await resetSwitcherCookies(authenticatedPage);
    await switchForm(authenticatedPage, FORM_LABELS.legacySingle);

    const sp = new SystemStatusPage(authenticatedPage);
    await sp.expectLoaded();

    await expect(sp.agentsCard).toHaveCount(0);
  });
});

// ─── Group 4: Error handling ────────────────────────────────────────────────
test.describe('System status — core data-source failure', () => {
  test('a 500 from /statistics/security-overview degrades to an empty trend without crashing the page', async ({
    authenticatedPage,
  }) => {
    await resetSwitcherCookies(authenticatedPage);
    // security-overview is a CORE source (KPI threats + threat trend) — a 500
    // rejects the combined dashboard query, so the trend falls back to [] and
    // renders its empty state instead of throwing.
    await authenticatedPage.route('**/api/v1/statistics/security-overview**', (r) =>
      r.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ error: 'boom' }) }),
    );

    const sp = new SystemStatusPage(authenticatedPage);
    await sp.goto();

    // Page shell + heading render normally — no crash / no error boundary.
    // ("系统状态" also matches the sidebar nav button + the system-health-card
    // footer link, so assert via the page `<h1>` specifically, not free text.)
    await sp.expectLoaded();
    await expect(sp.heading).toHaveText('系统状态');

    // The combined query (Promise.all) rejects as a whole, so the trend card
    // settles into its own empty state rather than throwing.
    await expect(sp.trendCard).toBeVisible();
    await expect(sp.trendEmptyState).toBeVisible({ timeout: 10000 });

    // The rest of the page is still interactive (KPI grid mounted, not stuck
    // on an infinite skeleton / blank screen).
    await expect(sp.kpiGrid).toBeVisible();
  });
});
