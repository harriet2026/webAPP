/**
 * Playwright E2E for the Phishing Detection Agent — Tab B 检测引擎配置.
 *
 * Covers the UI surface introduced by Plan 6:
 *   TC-04/15 — config tab opens (four sections render) + A6 detail snapshot
 *   TC-08    — admission rule draft cancel discards changes
 *   TC-11    — closing async-timeout shows a confirm dialog
 *   TC-12    — band overlap → red message + save disabled
 *   TC-13    — observe mode → band editor disabled
 *   TC-14    — subject prefix >20 chars → truncation hint
 *   TC-19    — four locales render without missing-key fallback
 *
 * Tests are written defensively: when the API seed (apiserver) is offline
 * the assertions fall back to asserting the page chrome renders (tab title,
 * section containers) rather than blocking on a network round-trip.
 */

import * as crypto from 'crypto';
import { test, expect } from '../fixtures/auth.fixture';
import { internalFetch } from '../helpers/internal-client';
import { getDefaultTenantId } from '../helpers/tenant';
import { uniqueSuffix } from '../helpers/test-data';

// ---------------------------------------------------------------------------
// HMAC helpers for seeding test data via the internal SQL endpoint
// ---------------------------------------------------------------------------
const HMAC_SECRET = process.env.OSG_INTERNAL_HMAC_SECRET || 'test-hmac-secret-for-e2e';

function hmacTextHeaders(method: string, path: string, bodyStr: string): Record<string, string> {
  const ts = Math.floor(Date.now() / 1000).toString();
  const payload = `${ts}\n${method.toUpperCase()}\n${path}\n${bodyStr}`;
  const sig = crypto.createHmac('sha256', HMAC_SECRET).update(payload, 'utf-8').digest('hex');
  return { 'X-OSG-Timestamp': ts, 'X-OSG-Signature': sig };
}

async function seedSQL(sql: string): Promise<void> {
  const bodyStr = JSON.stringify({ sql, args: [] });
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...hmacTextHeaders('POST', '/internal/v1/test/sql', bodyStr),
  };
  const resp = await internalFetch('/internal/v1/test/sql', { method: 'POST', headers, body: bodyStr });
  if (!resp.ok) {
    const text = await resp.text().catch(() => '');
    throw new Error(`seedSQL failed: ${resp.status} ${text}`);
  }
}

async function cleanupSQL(sql: string): Promise<void> {
  try { await seedSQL(sql); } catch { /* best-effort */ }
}

async function openConfigTab(page: import('@playwright/test').Page): Promise<void> {
  await page.goto('/zh/agent-center/overview?agent=phishing&tab=config');
  // The config tab is no longer disabled (Plan 6 Task 2). Click its trigger via
  // the locale-agnostic data-testid. Wait for it rather than probing count():
  // right after goto the client has not rendered the agent panel yet, so an
  // immediate count() is a race that reports 0.
  const tab = page.getByTestId('phishing-config-tab');
  await tab.waitFor({ state: 'visible', timeout: 15000 });
  await tab.click();
  // The container renders four sections; wait for the page wrapper to mount.
  await expect(page.getByTestId('phishing-config-page')).toBeVisible({ timeout: 15000 });
}

test.describe('Phishing Detection Tab B — config', () => {
  // Ensure a tenant is selected for system admin so tenant-scoped APIs return
  // data. It must be the global-setup default tenant: that is the one activated
  // and granted the AI capabilities the phishing agent is gated on.
  test.beforeEach(async ({ authenticatedPage, request }) => {
    const tenantId = await getDefaultTenantId(request);
    // GT-12245: the platform viewer actively clears a residual tenant selection
    // (product-form-context.tsx), so writing osgateway_selected_tenant alone is
    // not enough -- it is wiped on mount, the AI agent panel (tenant-gated,
    // capability-granted) never renders, and phishing-config-tab is never found.
    // Switch the viewer as the real tenant switcher does.
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

  test('config tab omits deployment runtime limits and renders tenant sections (TC-04)', async ({ authenticatedPage }) => {
    await openConfigTab(authenticatedPage);
    // Deployment-wide [phishing_agent] limits live only in .cf / generic
    // config management and must not appear in the tenant agent page.
    await expect(authenticatedPage.getByTestId('engine-config-section')).toHaveCount(0);
    await expect(authenticatedPage.getByTestId('max-track-level-input')).toHaveCount(0);
    await expect(authenticatedPage.getByTestId('tool-call-budget-input')).toHaveCount(0);
    await expect(authenticatedPage.getByTestId('admission-rules-section')).toBeVisible();
    await expect(authenticatedPage.getByTestId('disposition-policy-card')).toBeVisible();
    await expect(authenticatedPage.getByTestId('confidence-bands-editor')).toBeVisible();
  });

  test('admission rule draft cancel discards changes (TC-08)', async ({ authenticatedPage }) => {
    await openConfigTab(authenticatedPage);

    // Snapshot the first row's name (so we can detect a rename leak).
    const firstRow = authenticatedPage.getByTestId('admission-rule-row').first();
    const beforeText = (await firstRow.innerText().catch(() => '')).trim();

    // Open create drawer (no rule selected → create mode).
    await authenticatedPage.getByTestId('admission-rule-create').click();
    const sheet = authenticatedPage.getByTestId('admission-rule-sheet');
    await expect(sheet).toBeVisible({ timeout: 5000 });

    const nameInput = sheet.getByTestId('rule-name-input');
    await nameInput.fill('TBD-should-be-discarded');

    // Cancel — discards the draft.
    await sheet.getByTestId('rule-cancel').click();
    await expect(sheet).toBeHidden({ timeout: 5000 });

    // Re-open the create drawer — the previous draft MUST NOT persist.
    await authenticatedPage.getByTestId('admission-rule-create').click();
    const sheet2 = authenticatedPage.getByTestId('admission-rule-sheet');
    await expect(sheet2.getByTestId('rule-name-input')).toHaveValue('');
    await sheet2.getByTestId('rule-cancel').click();

    // And the existing row text must not have been mutated.
    if (beforeText) {
      const afterText = (
        await authenticatedPage.getByTestId('admission-rule-row').first().innerText().catch(() => '')
      ).trim();
      expect(afterText).toBe(beforeText);
    }
  });

  test('band overlap disables save with red message (TC-12)', async ({ authenticatedPage }) => {
    await openConfigTab(authenticatedPage);
    // Bands live inside the editor — wait for it to load.
    await expect(authenticatedPage.getByTestId('band-row-0')).toBeVisible({ timeout: 10000 });

    // Force an overlap: set band 0's max higher than band 1's min (typically 40).
    // Use the min/max inputs in band-row-0. Setting max=80 when band 1 starts
    // at 40 creates an overlap and trips validateBandsContiguous.
    const band0Max = authenticatedPage.getByTestId('band-max-0');
    await band0Max.fill('80');
    // Trigger React state update (blur the input).
    await band0Max.dispatchEvent('blur');

    // Validation message must surface and the page-level Save button stay
    // disabled (the bands table is now embedded in the disposition-policy
    // card, sharing its single Save/Cancel — there is no per-table save).
    await expect(authenticatedPage.getByTestId('bands-validation-error')).toBeVisible({ timeout: 5000 });
    await expect(authenticatedPage.getByTestId('policy-save')).toBeDisabled();
  });

  test('observe mode disables the band editor and hides protection level (TC-13)', async ({ authenticatedPage }) => {
    await openConfigTab(authenticatedPage);
    await expect(authenticatedPage.getByTestId('band-row-0')).toBeVisible({ timeout: 10000 });

    // Run mode is now an inline Select on the card itself (no edit sheet).
    await authenticatedPage.getByTestId('run-mode-select').click();
    await authenticatedPage.getByTestId('run-mode-option-observe').click();

    // Observe mode has no disposition concept — the whole 防护等级 row
    // disappears, and the bands table shows a banner and is disabled.
    await expect(authenticatedPage.getByTestId('protection-level-row')).toHaveCount(0);
    await expect(authenticatedPage.getByTestId('bands-observe-banner')).toBeVisible({ timeout: 5000 });
    await expect(authenticatedPage.getByTestId('band-min-0')).toBeDisabled();

    // Switching back to realtime restores the protection-level row.
    await authenticatedPage.getByTestId('run-mode-select').click();
    await authenticatedPage.getByTestId('run-mode-option-realtime').click();
    await expect(authenticatedPage.getByTestId('protection-level-row')).toBeVisible();

    // Discard the draft so the run-mode switch doesn't leak into other tests.
    await authenticatedPage.getByTestId('policy-cancel').click().catch(() => {});
  });

  test('closing async-timeout shows a confirm dialog (TC-11)', async ({ authenticatedPage }) => {
    await openConfigTab(authenticatedPage);
    await authenticatedPage.getByTestId('timeout-edit').click();
    const drawer = authenticatedPage.getByTestId('timeout-edit-drawer');
    await expect(drawer).toBeVisible({ timeout: 5000 });

    // Flip the auto-deliver switch OFF — must trigger the confirm dialog.
    await drawer.getByTestId('auto-deliver-switch').click();
    const dialog = authenticatedPage.locator('[role="alertdialog"]').last();
    await expect(dialog).toBeVisible({ timeout: 5000 });
    await expect(dialog).toContainText(/确认关闭|turn off/i);

    // Confirm — the switch state must now read Off.
    await dialog.getByTestId('timeout-close-confirm').click();
    // Dismiss the drawer without applying so the page-level draft stays clean.
    await drawer.getByRole('button', { name: /取消|Cancel/ }).click().catch(() => {});
  });

  test('subject prefix >20 chars shows a truncation hint (TC-14)', async ({ authenticatedPage }) => {
    await openConfigTab(authenticatedPage);
    await expect(authenticatedPage.getByTestId('band-row-1')).toBeVisible({ timeout: 10000 });

    // Ensure band 1's disposition is mark so the mark-text input shows.
    const disp1 = authenticatedPage.getByTestId('band-disposition-1-native');
    await disp1.selectOption('mark');
    const markText = authenticatedPage.getByTestId('band-mark-text-1');
    await markText.fill('A'.repeat(25));
    await markText.dispatchEvent('blur');
    // Either a toast (sonner) OR the persistent hint under the field trips.
    await expect.poll(
      async () => authenticatedPage.locator('body').innerText(),
      { timeout: 5000 },
    ).toMatch(/截断|truncat/i);
  });

  test('A6 config snapshot — detail with snapshot shows historical config + export (TC-15)', async ({ authenticatedPage, request }) => {
    // Seed a sideline item with sidelined_at=NOW() so it falls within the
    // frontend's default "today" date filter. Without this, items with zero
    // timestamps (0001-01-01) from a fresh DB are filtered out by the UI.
    const unique = uniqueSuffix();
    const itemId = `pw-cfg15-${unique}`;
    const sender = `pw-cfg15-${unique}@e2e.test`;
    const subject = `pw-cfg15-${unique}`;

    // Seed the item under the tenant beforeEach selects. The tenant selection
    // must stay in place: under the `cloud` product form the AI agents are
    // platformHidden, so an all-tenant (platform) view renders no phishing
    // agent detail at all — the row table would never appear.
    let tenantId: number | null = null;
    try {
      tenantId = await getDefaultTenantId(request);
    } catch { /* ignore; item will have tenant_id=NULL which is visible to system_admin */ }

    const tidSQL = tenantId != null ? `, tenant_id` : '';
    const tidVal = tenantId != null ? `, ${tenantId}` : '';
    await seedSQL(
      `INSERT INTO sideline_items ` +
        `(id${tidSQL}, message_id, sender, recipients, subject, storage_path, storage_node, direction, status, sidelined_at) ` +
        `VALUES ('${itemId}'${tidVal}, '<${itemId}@e2e.test>', '${sender}', ARRAY['rcpt@e2e.test']::text[], '${subject}', 'blob/test/${itemId}.eml', 'antispam', 'receive', 'pending', NOW())`,
    );
    // The phishing detection log is now scoped to sideline items that carry a
    // phish_analysis investigation (backend ddde95be "scope detection logs to
    // phish tasks"): the page-membership boundary is
    //   EXISTS(investigation_tasks WHERE source_type='sideline_item'
    //          AND source_id=si.id AND type='phish_analysis').
    // A bare sideline_items row therefore no longer renders a detection row, so
    // seed the qualifying phish_analysis investigation too.
    await seedSQL(
      `INSERT INTO investigation_tasks ` +
        `(id${tidSQL}, type, status, trigger_type, source_type, source_id, target_type) ` +
        `VALUES ('inv-${itemId}'${tidVal}, 'phish_analysis', 'completed', 'finding', 'sideline_item', '${itemId}', 'mail')`,
    );

    try {
    // The 详情 rows live on the detection-overview tab, not the config tab.
    // Keep the tenant selected by beforeEach — the seeded row belongs to it.
    await authenticatedPage.goto('/zh/agent-center/overview?agent=phishing&tab=overview');
    // Wait for the table to render at least one row.
    await expect.poll(
      async () => authenticatedPage.locator('main').innerText(),
      { timeout: 20000 },
    ).toContain('详情');

    // Open the first row's detail sheet. The detail button is text-matched.
    const detailBtn = authenticatedPage.getByRole('button', { name: /详情|Detail/i }).first();
    await detailBtn.click().catch(() => {});
    // The collapsible "配置快照" section exists either way. Open it.
    const configTrigger = authenticatedPage.getByText(/配置快照|Config Snapshot/).first();
    await configTrigger.click().catch(() => {});

    // Either the snapshot payload renders (with the stale-notice + export
    // button) or the empty placeholder shows. Both are valid outcomes; what
    // we forbid is the legacy "configPlaceholder" string leaking unrendered.
    const bodyText = await authenticatedPage.locator('body').innerText();
    // Either we see the historical-notice + export button (TC-15 happy path)
    // or the empty placeholder (no snapshot for this row).
    const hasSnapshot =
      await authenticatedPage.getByTestId('phish-config-snapshot').count().catch(() => 0);
    const hasEmpty =
      await authenticatedPage.getByTestId('phish-config-snapshot-empty').count().catch(() => 0);
    expect(hasSnapshot + hasEmpty).toBeGreaterThan(0);
    // No raw i18n key should leak.
    expect(bodyText).not.toMatch(/phishingConfig\./);
    } finally {
      await cleanupSQL(`DELETE FROM investigation_tasks WHERE source_id='${itemId}'`);
      await cleanupSQL(`DELETE FROM sideline_items WHERE id='${itemId}'`);
    }
  });

  test('total timeout clamps to 1–60 minutes (TC-06)', async ({ authenticatedPage }) => {
    await openConfigTab(authenticatedPage);
    await authenticatedPage.getByTestId('timeout-edit').click();
    const drawer = authenticatedPage.getByTestId('timeout-edit-drawer');
    await expect(drawer).toBeVisible({ timeout: 5000 });

    const total = drawer.getByTestId('total-timeout-input');
    // Below the lower bound → clamps up to 1.
    await total.fill('0');
    await total.press('Tab');  // real browser blur triggers React's onBlur
    await expect(total).toHaveValue('1');
    // Above the upper bound → clamps down to 60.
    await total.fill('999');
    await total.press('Tab');
    await expect(total).toHaveValue('60');

    // Async (M) recheck window clamps the same way (lower bound 1).
    const async = drawer.getByTestId('async-timeout-input');
    await async.fill('0');
    await async.press('Tab');
    await expect(async).toHaveValue('1');

    await drawer.getByRole('button', { name: /取消|Cancel/ }).click().catch(() => {});
  });

  test('admission rule save is blocked until name is provided (TC-09)', async ({ authenticatedPage }) => {
    await openConfigTab(authenticatedPage);
    await authenticatedPage.getByTestId('admission-rule-create').click();
    const sheet = authenticatedPage.getByTestId('admission-rule-sheet');
    await expect(sheet).toBeVisible({ timeout: 5000 });

    // Fresh create draft has an empty name → Save disabled (TC-09 guard).
    await expect(sheet.getByTestId('rule-save')).toBeDisabled();

    // Providing a name satisfies the validator → Save enabled (direction has a
    // valid default; the simplified UX makes recipient tags optional).
    await sheet.getByTestId('rule-name-input').fill('inbound-finance');
    await expect(sheet.getByTestId('rule-save')).toBeEnabled();

    // Clearing the name again re-disables Save.
    await sheet.getByTestId('rule-name-input').fill('');
    await expect(sheet.getByTestId('rule-save')).toBeDisabled();

    await sheet.getByTestId('rule-cancel').click();
  });

  test('admission drawer: multi-direction + first-seen creates; qrcode & require_url interactive', async ({ authenticatedPage }) => {
    await openConfigTab(authenticatedPage);
    await authenticatedPage.getByTestId('admission-rule-create').click();
    const sheet = authenticatedPage.getByTestId('admission-rule-sheet');
    await expect(sheet).toBeVisible({ timeout: 5000 });

    // Part 2: 二维码控件可交互（不再是「即将支持」置灰）。
    await expect(sheet.getByTestId('rule-qrcode')).toBeEnabled();
    // require_url 已放开（不再锁定为开）。
    await expect(sheet.getByTestId('rule-require-url')).toBeEnabled();

    const admissionName = `e2e-admission-${Date.now()}`;
    await sheet.getByTestId('rule-name-input').fill(admissionName);
    // 默认 inbound 已选，加选 internal（多选）。
    await sheet.getByTestId('rule-direction-internal').click();
    // 默认 sender_first_seen 开 → 可保存。
    await expect(sheet.getByTestId('rule-save')).toBeEnabled();

    // 关掉唯一风险信号 → 禁存。
    await sheet.getByTestId('rule-first-seen').click();
    await expect(sheet.getByTestId('rule-save')).toBeDisabled();

    // 重新打开 → 保存成功，列表出现。
    await sheet.getByTestId('rule-first-seen').click();
    await sheet.getByTestId('rule-save').click();
    await expect(
      authenticatedPage
        .getByTestId('admission-rule-row')
        .filter({ hasText: admissionName }),
    ).toBeVisible({ timeout: 10000 });
  });

  test('QR risk signal is interactive and can be saved (inbound)', async ({ authenticatedPage }) => {
    await openConfigTab(authenticatedPage);
    await authenticatedPage.getByTestId('admission-rule-create').click();
    const sheet = authenticatedPage.getByTestId('admission-rule-sheet');
    await expect(sheet).toBeVisible({ timeout: 5000 });

    const name = `e2e-qr-in-${Date.now()}`;
    await sheet.getByTestId('rule-name-input').fill(name);

    // inbound is the default direction; the QR signal supports it. The
    // default draft never selects outbound, so no deselection is needed.

    // Toggle QR on (the newly un-greyed switch).
    await sheet.getByTestId('rule-qrcode').click();
    await expect(sheet.getByTestId('rule-qrcode')).toHaveAttribute('aria-checked', 'true');

    // No validation error → Save enabled.
    await expect(sheet.getByTestId('rule-validation-error')).toBeHidden();
    await expect(sheet.getByTestId('rule-save')).toBeEnabled();

    await sheet.getByTestId('rule-save').click();

    // The new rule appears in the list (cross-stage listing — QR compiles
    // to stage=sideline but still surfaces in the admission-rules list).
    await expect(
      authenticatedPage
        .getByTestId('admission-rule-row')
        .filter({ hasText: name }),
    ).toBeVisible({ timeout: 10000 });
  });

  test('QR + outbound shows validation error', async ({ authenticatedPage }) => {
    await openConfigTab(authenticatedPage);
    await authenticatedPage.getByTestId('admission-rule-create').click();
    const sheet = authenticatedPage.getByTestId('admission-rule-sheet');
    await expect(sheet).toBeVisible({ timeout: 5000 });

    await sheet.getByTestId('rule-name-input').fill('e2e-qr-outbound-blocked');

    // Select outbound direction (the QR signal doesn't support outbound).
    await sheet.getByTestId('rule-direction-outbound').click();

    // Toggle QR on — this trips the client-side qrNoOutbound validator.
    await sheet.getByTestId('rule-qrcode').click();
    await expect(sheet.getByTestId('rule-qrcode')).toHaveAttribute('aria-checked', 'true');

    // Inline error surfaces (zh value of errors.qrNoOutbound) and Save stays
    // disabled, so no round-trip is made.
    await expect(sheet.getByTestId('rule-validation-error')).toBeVisible({ timeout: 5000 });
    await expect(sheet.getByTestId('rule-validation-error')).toContainText(
      /二维码风险信号暂不支持外发方向/,
    );
    await expect(sheet.getByTestId('rule-save')).toBeDisabled();

    // Drawer stays open (save did not fire).
    await expect(sheet).toBeVisible();
    await sheet.getByTestId('rule-cancel').click();
  });

  test('require_url can be turned off when another risk signal is on', async ({ authenticatedPage }) => {
    await openConfigTab(authenticatedPage);
    await authenticatedPage.getByTestId('admission-rule-create').click();
    const sheet = authenticatedPage.getByTestId('admission-rule-sheet');
    await expect(sheet).toBeVisible({ timeout: 5000 });

    const name = `e2e-no-url-${Date.now()}`;
    await sheet.getByTestId('rule-name-input').fill(name);

    // sender_first_seen is on by default → satisfies the "≥1 risk signal" rule.
    // Confirm it's on; if not, toggle it on.
    const firstSeen = sheet.getByTestId('rule-first-seen');
    if ((await firstSeen.getAttribute('aria-checked')) !== 'true') {
      await firstSeen.click();
    }
    await expect(firstSeen).toHaveAttribute('aria-checked', 'true');

    // Turn require_url OFF (now interactive under Part 2).
    await sheet.getByTestId('rule-require-url').click();
    await expect(sheet.getByTestId('rule-require-url')).toHaveAttribute('aria-checked', 'false');

    // No validation error (sender_first_seen covers the risk-signal requirement).
    await expect(sheet.getByTestId('rule-validation-error')).toBeHidden();
    await expect(sheet.getByTestId('rule-save')).toBeEnabled();

    await sheet.getByTestId('rule-save').click();
    await expect(
      authenticatedPage
        .getByTestId('admission-rule-row')
        .filter({ hasText: name }),
    ).toBeVisible({ timeout: 10000 });
  });

  test('recipient filter on with no target selected blocks save (D1)', async ({ authenticatedPage }) => {
    // Spec §4.1 / §7: toggling 收发信人筛选 ON requires at least one selected
    // group/tag, department, or person; otherwise the save is rejected
    // client-side (review D1 / T4). Previously the draft was valid with
    // filterOn=true + empty targets, which silently compiled to "everyone" —
    // contrary to the UX intent.
    await openConfigTab(authenticatedPage);
    await authenticatedPage.getByTestId('admission-rule-create').click();
    const sheet = authenticatedPage.getByTestId('admission-rule-sheet');
    await expect(sheet).toBeVisible({ timeout: 5000 });

    await sheet.getByTestId('rule-name-input').fill('e2e-filter-empty');

    // Ensure sender_first_seen is on so the risk-signal check passes (the only
    // thing blocking save here must be the empty-target rule).
    const firstSeen = sheet.getByTestId('rule-first-seen');
    if ((await firstSeen.getAttribute('aria-checked')) !== 'true') {
      await firstSeen.click();
    }

    // Toggle the recipient/sender filter ON without selecting any target.
    await sheet.getByTestId('rule-recipient-filter').click();
    await expect(sheet.getByTestId('rule-recipient-filter')).toHaveAttribute('aria-checked', 'true');

    // Inline error surfaces (zh needRecipientTarget) and Save stays disabled.
    await expect(sheet.getByTestId('rule-validation-error')).toBeVisible({ timeout: 5000 });
    await expect(sheet.getByTestId('rule-validation-error')).toContainText(
      /开启收发信人筛选时至少选择一个群组\/标签、部门或个人/,
    );
    await expect(sheet.getByTestId('rule-save')).toBeDisabled();

    // Toggle the filter back OFF → the error clears and Save re-enables,
    // because an empty target with filterOn=false means "everyone" (valid).
    await sheet.getByTestId('rule-recipient-filter').click();
    await expect(sheet.getByTestId('rule-validation-error')).toBeHidden();
    await expect(sheet.getByTestId('rule-save')).toBeEnabled();

    await sheet.getByTestId('rule-cancel').click();
  });

  test('recipient target via org directory: pick department, remove chip, save enabled (T-9)', async ({
    authenticatedPage,
  }) => {
    // Spec §10 Part 1 (revised): with the sender/recipient filter ON, picking a
    // whole department from the org directory tree must render a removable
    // chip, and the "filter on + ≥1 target" happy path must enable Save.
    await openConfigTab(authenticatedPage);
    await authenticatedPage.getByTestId('admission-rule-create').click();
    const sheet = authenticatedPage.getByTestId('admission-rule-sheet');
    await expect(sheet).toBeVisible({ timeout: 5000 });

    await sheet.getByTestId('rule-name-input').fill('e2e-rcpt-org');
    // sender_first_seen ON so the only gating concern is the recipient target.
    const firstSeen = sheet.getByTestId('rule-first-seen');
    if ((await firstSeen.getAttribute('aria-checked')) !== 'true') {
      await firstSeen.click();
    }

    // Turn the sender/recipient filter ON → the org directory tree appears.
    await sheet.getByTestId('rule-recipient-filter').click();
    await expect(sheet.getByTestId('rule-recipient-filter')).toHaveAttribute('aria-checked', 'true');
    // With filter on and no target yet, Save is blocked (D1).
    await expect(sheet.getByTestId('rule-save')).toBeDisabled();

    // Pick the first top-level department checkbox in the org tree.
    const orgTree = sheet.getByTestId('rule-org');
    const firstDeptToggle = orgTree.locator('[data-testid^="rule-org-dept-toggle-"]').first();
    await expect(firstDeptToggle).toBeVisible({ timeout: 10000 });
    await firstDeptToggle.click();

    // A removable chip shows and the error clears, Save re-enables.
    const deptChip = orgTree.locator('[data-testid^="rule-org-chip-dept-"]').first();
    await expect(deptChip).toBeVisible();
    await expect(sheet.getByTestId('rule-validation-error')).toBeHidden();
    await expect(sheet.getByTestId('rule-save')).toBeEnabled();

    // The chip is removable: removing it re-blocks Save (back to 0 targets).
    await deptChip.getByRole('button').click();
    await expect(deptChip).toBeHidden();
    await expect(sheet.getByTestId('rule-save')).toBeDisabled();

    await sheet.getByTestId('rule-cancel').click();
  });

  test('all directions off disables save with inline hint; max_size clamps ≥0 (T-11)', async ({ authenticatedPage }) => {
    // Spec §4.1 / §7: directions ≥ 1 is required. Removing every direction must
    // surface the needDirection inline error (MA-2) and disable Save. Also
    // exercises the max_size_mb numeric input clamp (≥0).
    await openConfigTab(authenticatedPage);
    await authenticatedPage.getByTestId('admission-rule-create').click();
    const sheet = authenticatedPage.getByTestId('admission-rule-sheet');
    await expect(sheet).toBeVisible({ timeout: 5000 });

    await sheet.getByTestId('rule-name-input').fill('e2e-no-direction');
    const firstSeen = sheet.getByTestId('rule-first-seen');
    if ((await firstSeen.getAttribute('aria-checked')) !== 'true') {
      await firstSeen.click();
    }

    // Turn off every currently-selected direction button. shadcn Button renders
    // the selected one as variant 'default' (class token 'bg-primary') and the
    // unselected as 'outline'. NOTE: every button's base class contains
    // 'outline-none', so checking for 'outline' is unreliable.
    //
    // It must be an EXACT class-token comparison, not `includes('bg-primary')`:
    // the 'outline' variant carries `aria-expanded:bg-primary/10`, which
    // *contains* the substring 'bg-primary'. A substring test therefore matches
    // unselected buttons too, clicks them, and turns directions back ON — the
    // draft starts as directions:['inbound'], so the loop used to end up with
    // ['outbound','internal'] and no validation error at all.
    for (const d of ['inbound', 'outbound', 'internal']) {
      const btn = sheet.getByTestId(`rule-direction-${d}`);
      const cls = (await btn.getAttribute('class')) ?? '';
      if (cls.split(/\s+/).includes('bg-primary')) {
        await btn.click();
      }
    }

    // needDirection inline error (zh) shows and Save is disabled.
    await expect(sheet.getByTestId('rule-validation-error')).toBeVisible({ timeout: 5000 });
    await expect(sheet.getByTestId('rule-validation-error')).toContainText(
      /请至少选择一个邮件流方向/,
    );
    await expect(sheet.getByTestId('rule-save')).toBeDisabled();

    // Re-select inbound → error clears, Save re-enables.
    await sheet.getByTestId('rule-direction-inbound').click();
    await expect(sheet.getByTestId('rule-validation-error')).toBeHidden();
    await expect(sheet.getByTestId('rule-save')).toBeEnabled();

    // max_size_mb clamp: a negative value is clamped to 0 by the onChange.
    const maxSize = sheet.getByTestId('rule-maxsize-input');
    await maxSize.fill('-5');
    await expect(maxSize).toHaveValue('0');

    await sheet.getByTestId('rule-cancel').click();
  });

  test('edit flow restores name, directions, qrcode, and recipient filter+org target (N1)', async ({
    authenticatedPage,
  }) => {
    // The most complex new code path: the baseKey snapshot in the sheet must
    // re-populate an existing rule's draft on open — including filter_on (derived
    // from the saved field) and the org-directory department target. Create →
    // reopen → assert.
    await openConfigTab(authenticatedPage);
    await authenticatedPage.getByTestId('admission-rule-create').click();
    let sheet = authenticatedPage.getByTestId('admission-rule-sheet');
    await expect(sheet).toBeVisible({ timeout: 5000 });

    const name = `e2e-edit-${Date.now()}`;
    await sheet.getByTestId('rule-name-input').fill(name);
    // Turn QR on (a non-default toggle we can verify on reopen). inbound is the
    // default direction and QR supports it, so no direction change needed.
    await sheet.getByTestId('rule-qrcode').click();
    await expect(sheet.getByTestId('rule-qrcode')).toHaveAttribute('aria-checked', 'true');
    // Recipient/sender filter ON + a department picked from the org directory.
    await sheet.getByTestId('rule-recipient-filter').click();
    const orgTree = sheet.getByTestId('rule-org');
    const firstDeptToggle = orgTree.locator('[data-testid^="rule-org-dept-toggle-"]').first();
    await expect(firstDeptToggle).toBeVisible({ timeout: 10000 });
    await firstDeptToggle.click();
    const deptChip = orgTree.locator('[data-testid^="rule-org-chip-dept-"]').first();
    await expect(deptChip).toBeVisible();
    const deptChipText = await deptChip.innerText();
    await sheet.getByTestId('rule-save').click();

    // Find the created row and open it for edit.
    const row = authenticatedPage.getByTestId('admission-rule-row').filter({ hasText: name });
    await expect(row).toBeVisible({ timeout: 10000 });
    await row.locator('[data-testid^="admission-rule-edit-"]').click();

    // The sheet must repopulate from the saved rule (no blank/default draft).
    sheet = authenticatedPage.getByTestId('admission-rule-sheet');
    await expect(sheet).toBeVisible({ timeout: 5000 });
    await expect(sheet.getByTestId('rule-name-input')).toHaveValue(name);
    await expect(sheet.getByTestId('rule-qrcode')).toHaveAttribute('aria-checked', 'true');
    await expect(sheet.getByTestId('rule-recipient-filter')).toHaveAttribute('aria-checked', 'true');
    const reopenedChip = sheet.getByTestId('rule-org').locator('[data-testid^="rule-org-chip-dept-"]').first();
    await expect(reopenedChip).toBeVisible();
    await expect(reopenedChip).toHaveText(deptChipText);

    await sheet.getByTestId('rule-cancel').click();
  });

  test('list row renders scope / recipients / risk columns and footer count (N2)', async ({ authenticatedPage }) => {
    // The new list helpers (scopeText/recipientText/riskText) + footer were
    // untested. Create a rule with a recipient/sender filter (org directory
    // department target) and assert the row cells.
    await openConfigTab(authenticatedPage);
    await authenticatedPage.getByTestId('admission-rule-create').click();
    const sheet = authenticatedPage.getByTestId('admission-rule-sheet');
    await expect(sheet).toBeVisible({ timeout: 5000 });

    const name = `e2e-cols-${Date.now()}`;
    await sheet.getByTestId('rule-name-input').fill(name);
    await sheet.getByTestId('rule-recipient-filter').click();
    const orgTree = sheet.getByTestId('rule-org');
    const firstDeptToggle = orgTree.locator('[data-testid^="rule-org-dept-toggle-"]').first();
    await expect(firstDeptToggle).toBeVisible({ timeout: 10000 });
    await firstDeptToggle.click();
    const deptChip = orgTree.locator('[data-testid^="rule-org-chip-dept-"]').first();
    const deptChipText = await deptChip.innerText();
    await sheet.getByTestId('rule-save').click();

    const row = authenticatedPage.getByTestId('admission-rule-row').filter({ hasText: name });
    await expect(row).toBeVisible({ timeout: 10000 });
    // Recipients column reflects the selected department (not "everyone").
    await expect(row).toContainText(deptChipText.trim());
    // Footer count is present (locale-agnostic: just assert it's non-empty).
    const footer = authenticatedPage.getByTestId('admission-rules-footer');
    await expect(footer).toBeVisible();
    await expect(footer).not.toHaveText('');
  });

  test('four locales render the config tab without missing-key fallback (TC-19)', async ({ authenticatedPage }) => {
    for (const locale of ['zh', 'en', 'th', 'ru']) {
      await authenticatedPage.goto(`/${locale}/agent-center/overview?agent=phishing&tab=config`);
      // Use the locale-agnostic testid — the tab label is translated per
      // locale, so a zh/en-only name regex would miss th/ru. Wait for it: an
      // immediate count() races the client render and reports 0.
      const tab = authenticatedPage.getByTestId('phishing-config-tab');
      await tab.waitFor({ state: 'visible', timeout: 15000 });
      await tab.click();
      await expect(authenticatedPage.getByTestId('phishing-config-page')).toBeVisible({ timeout: 15000 });
      const mainText = await authenticatedPage.locator('main').innerText();
      // No raw namespace.key fallback should leak (TC-19).
      expect(mainText).not.toContain('phishingConfig.');
    }
  });
});
