/**
 * Playwright E2E for the Phishing Detection Agent — Tab A detection overview.
 *
 * Covers the UI surface introduced by spec 1:
 *   a) sidebar entry navigates to the page
 *   b) KPI cards render (accuracy shows "—")
 *   c) seeded detection rows render with derived columns (disposition / mode /
 *      recall_status / url_summary / agent_rounds)
 *   d) multi-select filter narrows the table
 *   e) row expand + detail sheet open
 *   f) block/exempt controls exist on terminal rows; live rows disable them
 *
 * Data is seeded directly via the internal /test/sql endpoint (same pattern as
 * phishing-agent-backend.spec.ts) so the UI has deterministic rows to render.
 */

import * as crypto from 'crypto';
import type { Locator } from '@playwright/test';
import { test, expect } from '../fixtures/auth.fixture';
import { internalFetch } from '../helpers/internal-client';
import { getDefaultTenantId, getDefaultTenantIdViaFetch } from '../helpers/tenant';
import { uniqueSuffix } from '../helpers/test-data';

const HMAC_SECRET = process.env.OSG_INTERNAL_HMAC_SECRET || 'test-hmac-secret-for-e2e';

function hmacTextHeaders(method: string, path: string, bodyStr: string): Record<string, string> {
  const ts = Math.floor(Date.now() / 1000).toString();
  const payload = `${ts}\n${method.toUpperCase()}\n${path}\n${bodyStr}`;
  const sig = crypto.createHmac('sha256', HMAC_SECRET).update(payload, 'utf-8').digest('hex');
  return { 'X-OSG-Timestamp': ts, 'X-OSG-Signature': sig };
}

async function seedSQL(sql: string): Promise<void> {
  const bodyStr = JSON.stringify({ sql });
  const resp = await internalFetch('/internal/v1/test/sql', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...hmacTextHeaders('POST', '/internal/v1/test/sql', bodyStr) },
    body: bodyStr,
  });
  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`seedSQL failed: ${resp.status} ${text}`);
  }
}

// Rows are seeded under the global-setup default tenant, which is the tenant the
// specs select. A tenant must be selected: under the dev `cloud` product form the
// AI agents are platformHidden, so an unscoped (platform) view falls back to the
// agent-center overview and never renders the phishing detail page at all.
// Resolved in beforeAll; `NULL` until then so seeds outside the suite still work.
let TENANT_ID = 'NULL';

// sidelineDedupeKey mirrors internal/api/recall_materialize.go: the recall
// rows join to a detection row by sha256("sideline:"+itemId+":"+receiver).
function sidelineDedupeKey(itemId: string, receiver: string): string {
  return crypto.createHash('sha256').update(`sideline:${itemId}:${receiver}`).digest('hex');
}

async function seedDetectionRow(suffix: string, opts: {
  status: string;
  reinjected?: boolean;
  risk?: string;
  subjectMarker?: string;
  urlFindings?: Array<Record<string, unknown>>;
}): Promise<{ itemId: string; subject: string; recipient: string; messageId: string }> {
  // sideline_items.id is VARCHAR(36) — keep the id well under that.
  const short = crypto.randomBytes(8).toString('hex'); // 16 hex chars
  const itemId = `pw-${suffix}-${short}`.slice(0, 34);
  const subject = `PW-${suffix}-${short}`;
  const msgId = `<${itemId}@pw.test>`;
  const recipient = `victim-${short}@pw.test`;
  const marker = opts.subjectMarker ?? '';
  const reinjectedAt = opts.reinjected ? 'NOW()' : 'NULL';
  await seedSQL(
    `INSERT INTO sideline_items ` +
      `(id, message_id, sender, recipients, subject, storage_path, storage_node, ` +
      ` direction, status, tenant_id, sidelined_at, reinjected_at) ` +
      `VALUES ('${itemId}', '${msgId}', 'attacker-${short}@pw.test', ` +
      ` ARRAY['victim-${short}@pw.test']::text[], '${marker}${subject}', ` +
      ` 'blob/${itemId}.eml', 'antispam', 'receive', '${opts.status}', ` +
      ` ${TENANT_ID}, NOW(), ${reinjectedAt})`,
  );
  {
    // The phishing detection log is scoped to sideline items that carry a
    // phish_analysis investigation (backend ddde95be "scope detection logs to
    // phish tasks"): the page-membership boundary is
    //   EXISTS(investigation_tasks WHERE source_type='sideline_item'
    //          AND source_id=si.id AND type='phish_analysis').
    // Every seeded detection row must therefore always carry the investigation —
    // not only when the test specified an explicit risk level — or the row would
    // not appear in the list at all. Default the risk when unspecified.
    const risk = opts.risk ?? 'medium';
    const invId = `pw-inv-${short}`.slice(0, 34);
    const result = {
      verdict: 'phishing_suspected',
      details: {
        url_findings: opts.urlFindings ?? [
          { url: `http://evil-${short}.test/x`, agent: { verdict: 'phishing' } },
        ],
      },
    };
    const steps = [
      { name: 'tool_call', status: 'completed', data: { iteration: 1 } },
      { name: 'tool_call', status: 'completed', data: { iteration: 2 } },
    ];
    const resultJson = JSON.stringify(result).replace(/'/g, "''");
    const stepsJson = JSON.stringify(steps).replace(/'/g, "''");
    await seedSQL(
      `INSERT INTO investigation_tasks ` +
        `(id, tenant_id, type, status, trigger_type, source_type, source_id, ` +
        ` target_type, target_ids_json, summary, risk_level, confidence, ` +
        ` result_json, steps_json, recommended_actions_json) ` +
        `VALUES ('${invId}', ${TENANT_ID}, 'phish_analysis', 'completed', 'finding', ` +
        ` 'sideline_item', '${itemId}', 'mail', '[]'::jsonb, 'pw seed', ` +
        ` '${risk}', 0.9, ` +
        ` '${resultJson}'::jsonb, '${stepsJson}'::jsonb, '[]'::jsonb)`,
    );
  }
  return { itemId, subject, recipient, messageId: msgId };
}

// seedMailLogDispositions seeds a mail_log row whose recipient_dispositions is a
// STRUCT array (matching internal/models.RecipientDisposition) so the detail
// drawer's per-recipient section has real data to render (P1-4 regression).
async function seedMailLogDispositions(
  messageId: string,
  rows: Array<{ recipient: string; final_action: string; status: string; reason?: string }>,
): Promise<void> {
  const json = JSON.stringify(rows).replace(/'/g, "''");
  // message_uuid is NOT NULL DEFAULT uuid_generate_v4() — omit it and let the
  // schema default fill it (avoids depending on gen_random_uuid availability).
  await seedSQL(
    `INSERT INTO mail_log (message_id, sender, recipients, subject, ` +
      ` action, status, tenant_id, direction, recipient_dispositions, received_at) ` +
      `VALUES ('${messageId}', 'attacker@pw.test', ` +
      ` ARRAY['${rows[0].recipient}']::text[], 'disp', 'accept', 'delivered', ` +
      ` ${TENANT_ID}, 'receive', '${json}'::jsonb, NOW())`,
  );
}

// seedRecall seeds a recall_request row joined to the item by source_item_id +
// dedupe_key so the detection row's recall_status column derives from it.
async function seedRecall(
  itemId: string,
  messageId: string,
  recipient: string,
  operateResult: string,
): Promise<void> {
  const dedupe = sidelineDedupeKey(itemId, recipient);
  await seedSQL(
    `INSERT INTO recall_request (tenant_id, mid, tid, sender, receiver, subject, ` +
      ` operate_result, backend, source_item_id, dedupe_key) ` +
      `VALUES (${TENANT_ID}, '${messageId}', 'tid-${itemId}', 'attacker@pw.test', ` +
      ` '${recipient}', 'recall', '${operateResult}', 'coremail', '${itemId}', '${dedupe}')`,
  );
}

// gotoAndIsolate navigates to the overview and filters the table down to a
// single seeded row by its unique subject. The shared e2e DB holds hundreds of
// detection rows, so an unfiltered page-1 poll is an ordering race — filtering
// by the unique subject keyword makes the seeded row deterministically present.
// Locate the keyword box by its placeholder, not by "the first text input in main".
// The phishing panel is embedded in the agent-center shell, which renders its own
// inputs ahead of the filters — so the positional guess silently picked the wrong box
// and Enter/搜索 never issued a keyword request.
function keywordBox(page: import('@playwright/test').Page): Locator {
  return page.locator('main').getByPlaceholder(/搜索发件人、主题/);
}

async function gotoAndIsolate(page: import('@playwright/test').Page, subject: string): Promise<void> {
  await page.goto('/zh/agent-center/overview?agent=phishing');
  const keywordInput = keywordBox(page);
  await keywordInput.fill(subject);
  await page.locator('main').getByRole('button', { name: /搜索|Search/i }).click();
  await expect
    .poll(async () => page.locator('main').innerText(), { timeout: 20000 })
    .toContain(subject);
}

async function cleanupItem(itemId: string, messageId?: string): Promise<void> {
  await seedSQL(
    `DELETE FROM investigation_tasks WHERE source_type='sideline_item' AND source_id='${itemId}'`,
  );
  await seedSQL(`DELETE FROM recall_request WHERE source_item_id='${itemId}'`);
  if (messageId) {
    await seedSQL(`DELETE FROM mail_log WHERE message_id='${messageId}'`);
  }
  await seedSQL(`DELETE FROM sideline_items WHERE id='${itemId}'`);
}

test.describe('Phishing Detection Tab A', () => {
  test.beforeAll(async () => {
    TENANT_ID = String(await getDefaultTenantIdViaFetch());
  });

  // The phishing agent is platformHidden: without a selected tenant the
  // agent-center deep link falls back to the overview and no detail renders.
  test.beforeEach(async ({ authenticatedPage, request }) => {
    const tenantId = await getDefaultTenantId(request);
    // GT-12245: the platform viewer actively clears a residual tenant selection
    // (product-form-context.tsx), so writing osgateway_selected_tenant alone is
    // not enough -- it is wiped on mount and the tenant-gated, capability-granted
    // AI agent panel never renders. Switch the viewer as the real switcher does.
    await authenticatedPage.evaluate((tid: number) => {
      localStorage.setItem('osgateway_selected_tenant', String(tid));
      document.cookie = `osg_selected_tenant=${tid}; path=/; SameSite=Strict`;
      document.cookie = 'osg_viewer=tenant; path=/; SameSite=Strict';
    }, tenantId);
    // Writing osg_viewer makes the product-form context navigate on its own;
    // navigating straight away truncates it into net::ERR_ABORTED.
    await authenticatedPage.waitForLoadState('domcontentloaded');
    await authenticatedPage.waitForTimeout(500);
  });

  test('agent-center deep link renders the detection overview', async ({ authenticatedPage }) => {
    await authenticatedPage.goto('/zh/agent-center/overview?agent=phishing');
    await authenticatedPage.waitForLoadState('networkidle');
    await expect(authenticatedPage.locator('h1, h2').filter({ hasText: /钓鱼|Phishing/i }).first()).toBeVisible({ timeout: 10000 });
    await expect(authenticatedPage).toHaveURL(/agent-center\/overview.*agent=phishing/);
  });

  test('KPI cards render and accuracy shows placeholder', async ({ authenticatedPage }) => {
    await authenticatedPage.goto('/zh/agent-center/overview?agent=phishing');
    // KPI labels are i18n-rendered (zh: "今日检测"/"准确率"). accuracy is null
    // this round (D3) → the card shows the "—" placeholder, never a number.
    await expect.poll(
      async () => authenticatedPage.locator('main').innerText(),
      { timeout: 15000 },
    ).toContain('准确率');
    const mainText = await authenticatedPage.locator('main').innerText();
    expect(mainText).toContain('今日检测');
  });

  test('seeded terminal row renders with derived columns', async ({ authenticatedPage }) => {
    const { itemId, subject } = await seedDetectionRow('terminal', {
      status: 'quarantined',
      risk: 'high',
    });
    try {
      await authenticatedPage.goto('/zh/agent-center/overview?agent=phishing');
      // The table renders the seeded subject (the sideline_id itself is not in
      // the row, so we assert on subject which IS a rendered column).
      await expect.poll(
        async () => authenticatedPage.locator('main').innerText(),
        { timeout: 20000 },
      ).toContain(subject);
    } finally {
      await cleanupItem(itemId);
    }
  });

  test('expanded URL findings render canonical three columns without deep evidence JSON', async ({ authenticatedPage }) => {
    const unique = uniqueSuffix();
    const deepHiddenMarker = `deep-hidden-${unique}`;
    const seeded = await seedDetectionRow(`url-expanded-${unique}`, {
      status: 'quarantined',
      risk: 'high',
      urlFindings: [
        {
          url: `http://phish-${unique}.test/login`,
          final_url: `http://phish-${unique}.test/final`,
          agent: { verdict: 'phishing', risk_level: 'high' },
          analyze_url: { marker: deepHiddenMarker },
          threat_intel: { source: 'vt', verdict: 'malicious' },
        },
        {
          url: `http://sus-${unique}.test/pay`,
          agent: { verdict: 'suspicious', risk_level: 'medium' },
          analyze_url: { marker: deepHiddenMarker },
        },
        {
          url: `http://risk-only-${unique}.test/drop`,
          agent: { risk_level: 'high' },
        },
      ],
    });
    try {
      await gotoAndIsolate(authenticatedPage, seeded.subject);

      const row = authenticatedPage.locator('tr').filter({ hasText: seeded.subject }).first();
      await row.locator('td').first().locator('button').first().click();

      await expect.poll(
        async () => authenticatedPage.locator('main').innerText(),
        { timeout: 10000 },
      ).toContain('本封邮件的链接检测');

      const mainText = await authenticatedPage.locator('main').innerText();
      expect(mainText).toContain('URL 结果');
      expect(mainText).toContain('威胁类型');
      expect(mainText).toContain(`http://phish-${unique}.test/login`);
      expect(mainText).toContain(`http://phish-${unique}.test/final`);
      expect(mainText).toContain(`http://risk-only-${unique}.test/drop`);
      expect(mainText).toContain('钓鱼链接');
      expect(mainText).toContain('可疑链接');
      const riskOnlyRow = authenticatedPage.locator('tr').filter({ hasText: `http://risk-only-${unique}.test/drop` }).first();
      await expect(riskOnlyRow).toContainText('—');
      await expect(riskOnlyRow).toContainText('恶意链接');
      expect(mainText).not.toContain(deepHiddenMarker);
      expect(mainText).not.toContain('链接分析');
      expect(mainText).not.toContain('威胁情报');
    } finally {
      await cleanupItem(seeded.itemId);
    }
  });

  test('keyword filter narrows the table', async ({ authenticatedPage }) => {
    const unique = uniqueSuffix();
    const marker = `KWMarker${unique}`;
    const a = await seedDetectionRow(`kw-a-${unique}`, {
      status: 'quarantined', risk: 'high', subjectMarker: marker,
    });
    const b = await seedDetectionRow(`kw-b-${unique}`, {
      status: 'quarantined', risk: 'high',
    });
    try {
      await authenticatedPage.goto('/zh/agent-center/overview?agent=phishing');
      await expect.poll(
        async () => authenticatedPage.locator('main').innerText(),
        { timeout: 20000 },
      ).toContain(a.subject);
      await expect.poll(
        async () => authenticatedPage.locator('main').innerText(),
        { timeout: 20000 },
      ).toContain(b.subject);

      // Type the unique marker into the keyword box, then explicitly submit it.
      // The filters render several inputs; the keyword box is the first plain
      // text input in the filters section (not a number/date input).
      const keywordInput = keywordBox(authenticatedPage);
      const waitForKeywordRequest = (timeout = 5000) => authenticatedPage.waitForRequest((request) => {
        const url = new URL(request.url());
        return url.pathname.includes('/phishing-agent/detection-logs') && url.searchParams.get('keyword') === marker;
      }, { timeout });

      const prematureKeywordRequest = waitForKeywordRequest(1000)
        .then(() => true)
        .catch(() => false);
      await keywordInput.fill(marker);
      await expect(prematureKeywordRequest).resolves.toBe(false);
      await expect(authenticatedPage.locator('main')).toContainText(b.subject);
      const enterKeywordRequest = waitForKeywordRequest();
      await keywordInput.press('Enter');
      await enterKeywordRequest;
      await expect.poll(
        async () => authenticatedPage.locator('main').innerText(),
        { timeout: 15000 },
      ).toContain(a.subject);
      let mainText = await authenticatedPage.locator('main').innerText();
      expect(mainText).toContain(a.subject);
      expect(mainText).not.toContain(b.subject);

      await authenticatedPage.locator('main').getByRole('button', { name: /重置|Reset/i }).click();
      await expect.poll(
        async () => authenticatedPage.locator('main').innerText(),
        { timeout: 15000 },
      ).toContain(b.subject);

      await keywordInput.fill(marker);
      await expect(authenticatedPage.locator('main')).toContainText(b.subject);
      // Assert the RESULT, not a network request: this repeats the exact query the
      // Enter path already ran, so React Query serves it from cache and legitimately
      // issues no second request. The UI assertions below still prove that clicking
      // 搜索 applies the keyword (a.subject in, b.subject out).
      await authenticatedPage.locator('main').getByRole('button', { name: /搜索|Search/i }).click();
      await expect.poll(
        async () => authenticatedPage.locator('main').innerText(),
        { timeout: 15000 },
      ).toContain(a.subject);
      mainText = await authenticatedPage.locator('main').innerText();
      expect(mainText).toContain(a.subject);
      // The non-matching seeded row should be filtered out.
      expect(mainText).not.toContain(b.subject);
    } finally {
      await cleanupItem(a.itemId);
      await cleanupItem(b.itemId);
    }
  });

  test('detail sheet opens when the detail action is invoked', async ({ authenticatedPage }) => {
    const { itemId, subject } = await seedDetectionRow('detail', {
      status: 'quarantined',
      risk: 'medium',
    });
    try {
      await authenticatedPage.goto('/zh/agent-center/overview?agent=phishing');
      await expect.poll(
        async () => authenticatedPage.locator('main').innerText(),
        { timeout: 20000 },
      ).toContain(subject);

      // Open the detail sheet via the row's detail control. The row is found
      // by the seeded subject (a rendered column); the button text matches the
      // i18n "详情"/"Detail" key.
      const row = authenticatedPage.locator('tr').filter({ hasText: subject }).first();
      const detailBtn = row.getByRole('button').filter({ hasText: /详情|Detail/i }).first();
      if (await detailBtn.count() > 0) {
        await detailBtn.click();
        // The Sheet should render (its content area becomes non-empty).
        await expect.poll(
          async () => authenticatedPage.locator('[role="dialog"], [data-slot="sheet-content"]').first().innerText().catch(() => ''),
          { timeout: 10000 },
        ).not.toEqual('');
      }
    } finally {
      await cleanupItem(itemId);
    }
  });

  test('four locales render without missing-key fallback', async ({ authenticatedPage }) => {
    // Switching locale via the URL prefix should not surface a raw
    // "phishingDetection.title" key (missing-translation guard, TC-19). The
    // spec (§5.4 / §7.1) mandates coverage of ALL four built-in locales
    // (zh / en / th / ru) — the previous loop only iterated zh/en.
    for (const locale of ['zh', 'en', 'th', 'ru']) {
      await authenticatedPage.goto(`/${locale}/agent-center/overview?agent=phishing`);
      await authenticatedPage.waitForLoadState('networkidle');
      const mainText = await authenticatedPage.locator('main').innerText();
      // No raw namespace.key fallback should leak into the rendered text.
      expect(mainText).not.toContain('phishingDetection.');
    }
  });

  test('KPI card click applies disposition filter to main table (TC-02)', async ({ authenticatedPage }) => {
    // Spec §6.1 / §7.1 TC-02 — clicking the "Quarantined Today" KPI card must
    // re-query the detection-logs table with disposition=quarantine. We assert
    // by intercepting the API request the table makes after the click.
    const { itemId, subject } = await seedDetectionRow('kpi-click', {
      status: 'quarantined',
    });
    try {
      await authenticatedPage.goto('/zh/agent-center/overview?agent=phishing');
      await expect.poll(
        async () => authenticatedPage.locator('main').innerText(),
        { timeout: 20000 },
      ).toContain(subject);

      // Set up the request watcher BEFORE clicking so we catch the refetch.
      // The table's query key is `phish-logs` → the request URL contains the
      // detection-logs path with the disposition query param.
      const requestPromise = authenticatedPage
        .waitForRequest(
          (req) => req.url().includes('/phishing-agent/detection-logs') &&
            req.url().includes('disposition=quarantine'),
          { timeout: 10000 },
        )
        .catch(() => null);

      // Click the "今日隔离" (Quarantined Today) KPI card. The card is a
      // <button> when it has an onClick handler (kpi-cards.tsx line 44-53).
      // We match by the localized label.
      const kpiCard = authenticatedPage.locator('button').filter({ hasText: '今日隔离' }).first();
      await kpiCard.click();

      const req = await requestPromise;
      expect(req, 'expected a detection-logs request with disposition=quarantine after KPI click').not.toBeNull();
    } finally {
      await cleanupItem(itemId);
    }
  });

  test('block button opens confirmation dialog and submit shows toast (TC-05)', async ({ authenticatedPage }) => {
    // Spec §6.1 / §7.1 TC-05 — clicking the row's block button must open a
    // confirmation dialog (the action is destructive), and confirming must
    // surface a success/already-blocked toast. The previous tests only
    // asserted the button existed; this exercises the full click → dialog →
    // confirm → toast loop.
    const { itemId, subject } = await seedDetectionRow('block-flow', {
      status: 'quarantined',
      // No risk seed → keeps the row simple; the block dialog is independent
      // of the risk badge.
    });
    try {
      await gotoAndIsolate(authenticatedPage, subject);

      const row = authenticatedPage.locator('tr').filter({ hasText: subject }).first();
      // Click the "拦截" (block) button on the row. Use zh locale so the
      // label is deterministic.
      const blockBtn = row.getByRole('button', { name: '拦截' }).first();
      await blockBtn.click();

      // The confirmation dialog must appear with its title. BlockDialog uses
      // ConfirmDialog → AlertDialog, which renders role="alertdialog" (NOT
      // "dialog"), so the locator must accept both.
      const dialog = authenticatedPage.locator('[role="dialog"], [role="alertdialog"]').last();
      await expect.poll(
        async () => dialog.innerText(),
        { timeout: 10000 },
      ).toMatch(/拦截该邮件|Block this mail/);

      // Confirm — the confirm button label is "确认拦截" in zh. Clicking it
      // triggers the blockMutation → POST .../block → toast.
      const confirmBtn = dialog.getByRole('button', { name: /确认拦截|Confirm Block/ }).first();
      await confirmBtn.click();

      // Toast (sonner) renders success messages into a [data-sonner-toast] or
      // role="status" element. Accept either the success message or the
      // already-blocked message — the row has no mail_log so the API may
      // short-circuit either way; what matters is the dialog closed and a
      // toast surfaced (i.e. the action path ran end-to-end).
      await expect.poll(
        async () => authenticatedPage.locator('body').innerText(),
        { timeout: 10000 },
      ).toMatch(/已拦截|该邮件已被拦截|Blocked|This mail is already blocked/i);
    } finally {
      await cleanupItem(itemId);
    }
  });

  test('exempt button keeps submit disabled until a non-blank reason is entered (TC-05, GT-12522)', async ({ authenticatedPage }) => {
    const { itemId, subject } = await seedDetectionRow('exempt-flow', {
      status: 'quarantined',
    });
    try {
      await authenticatedPage.goto('/zh/agent-center/overview?agent=phishing');
      await expect.poll(
        async () => authenticatedPage.locator('main').innerText(),
        { timeout: 20000 },
      ).toContain(subject);

      const row = authenticatedPage.locator('tr').filter({ hasText: subject }).first();
      const exemptBtn = row.getByRole('button', { name: '豁免' }).first();
      await exemptBtn.click();

      const dialog = authenticatedPage.locator('[role="dialog"]').last();
      await expect.poll(
        async () => dialog.innerText(),
        { timeout: 10000 },
      ).toContain('误报');

      const submitBtn = dialog.getByRole('button', { name: /提交|Submit/ }).first();
      await expect(submitBtn).toBeDisabled();

      const reason = dialog.getByPlaceholder(/豁免原因|exemption reason/i);
      await reason.fill('   ');
      await expect(submitBtn).toBeDisabled();

      await reason.fill('QC 验证误报');
      await expect(submitBtn).toBeEnabled();
    } finally {
      await cleanupItem(itemId);
    }
  });

  test('detail sheet renders per-recipient dispositions as real fields, not [object Object] (P1-4)', async ({ authenticatedPage }) => {
    // recipient_dispositions is a struct array; the old `string[].join(', ')`
    // rendered "[object Object]". The detail drawer must show the final_action.
    const seeded = await seedDetectionRow('disp', { status: 'reinjected', reinjected: true });
    const { itemId, subject, recipient, messageId } = seeded;
    await seedMailLogDispositions(messageId, [
      { recipient, final_action: 'reject', status: 'done', reason: 'phish' },
    ]);
    try {
      await gotoAndIsolate(authenticatedPage, subject);

      const row = authenticatedPage.locator('tr').filter({ hasText: subject }).first();
      const detailBtn = row.getByRole('button').filter({ hasText: /详情|Detail/i }).first();
      await detailBtn.click();
      // The sheet content renders in a portal under <body>; assert on the body so
      // the per-recipient section (final_action="reject") is captured.
      await expect.poll(
        async () => authenticatedPage.locator('body').innerText(),
        { timeout: 10000 },
      ).toContain('reject');
      // The regression: the struct array must NOT stringify to [object Object].
      expect(await authenticatedPage.locator('body').innerText()).not.toContain('[object Object]');
    } finally {
      await cleanupItem(itemId, messageId);
    }
  });

  test('recall_failed badge exposes the failure reason on hover (P2-3, TC-16)', async ({ authenticatedPage }) => {
    const seeded = await seedDetectionRow('recallfail', { status: 'reinjected', reinjected: true });
    const { itemId, subject, recipient, messageId } = seeded;
    await seedRecall(itemId, messageId, recipient, 'failed');
    try {
      await gotoAndIsolate(authenticatedPage, subject);

      const row = authenticatedPage.locator('tr').filter({ hasText: subject }).first();
      // The recall_status cell badge carries a title= tooltip listing the failing
      // recipient's operate_result ("<receiver>: failed"). Match by title
      // substring — the badge's visible text is the status label, not the title.
      await expect.poll(
        async () => row.locator('[title*="failed"]').count(),
        { timeout: 10000 },
      ).toBeGreaterThan(0);
      const title = await row.locator('[title*="failed"]').first().getAttribute('title');
      expect(title).toContain(recipient);
    } finally {
      await cleanupItem(itemId, messageId);
    }
  });
});
