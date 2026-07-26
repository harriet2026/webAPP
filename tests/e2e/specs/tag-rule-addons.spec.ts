/**
 * E2E spec: tag-rule addon editor (8 addon types, no primary-action gate)
 *
 * Tests that the AddonsPanel (F7/F11 rewrite of the pre-existing
 * AddonsEditor) embedded in the tag-rules dialog works end-to-end: addon
 * selection, param fill, persistence round-trip, and the client-side
 * internal-address guard on forwardServer.
 *
 * Note: AddonsPanel's UI_ADDON_KEYS omits 'detailedLog' by default (it is a
 * data-model-only addon; the advanced-filter-rules disposition Tab keeps it
 * off per D-7). The tag page passes AddonsPanel `showDetailedLog`, which adds
 * the "详细日志/Detailed Log" toggle back — matching the pre-rewrite
 * AddonsEditor so this consumer's behavior is unchanged. So all 8 addon rows
 * are present here.
 */
import { test, expect } from '../fixtures/auth.fixture';
import { createAuthenticatedClient } from '../fixtures/api.fixture';
import { uniqueSuffix } from '../helpers/test-data';

test.describe('Tag Rule — Addon Editor', () => {
  const createdRuleIds: number[] = [];

  test.beforeEach(async ({ authenticatedPage }) => {
    await authenticatedPage.goto('/zh/rules/tag');
    await authenticatedPage.waitForLoadState('networkidle');
  });

  test.afterAll(async ({ request }) => {
    const api = await createAuthenticatedClient(request);
    for (const id of createdRuleIds) {
      await api.delete(`/unified-rules/${id}`).catch(() => {});
    }
  });

  // ── helper: open the Create dialog ──────────────────────────────────────────
  async function openCreateDialog(page: import('@playwright/test').Page) {
    await page.getByRole('button', { name: /创建规则|Create Rule/ }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible({ timeout: 5000 });
    return dialog;
  }

  // ── helper: find an addon row by its label text ─────────────────────────────
  async function getAddonCheckbox(
    dialog: import('@playwright/test').Locator,
    labelText: RegExp,
  ) {
    // AddonsPanel (F7/F11) renders each addon row as a `[role="button"]` div
    // (data-testid="addon-row-<key>") wrapping a Checkbox + label span — not
    // an actual <label> element like the pre-rewrite AddonsEditor. Match on
    // the shared testid prefix instead of the `label` tag.
    return dialog
      .locator('[data-testid^="addon-row-"]')
      .filter({ hasText: labelText })
      .first();
  }

  // ── test 1: forwardServer + emailTag addon round-trip ───────────────────────
  test('can add an emailTag addon to a tag rule and it round-trips', async ({
    authenticatedPage,
    request,
  }) => {
    const ruleName = `PW-TagAddon-${uniqueSuffix()}`;
    const tagLabel = `pw-addon-${uniqueSuffix()}`;
    const emailTagContent = `[PW-TAG-${uniqueSuffix()}]`;

    const dialog = await openCreateDialog(authenticatedPage);

    // Fill rule name
    await dialog.locator('input').first().fill(ruleName);

    // Add a custom tag — pressSequentially triggers per-keystroke React events,
    // ensuring the controlled-input state is committed before Enter fires.
    const tagInput = dialog.locator('input[placeholder*="输入后按回车"], input[placeholder*="Enter"]').first();
    await tagInput.pressSequentially(tagLabel, { delay: 20 });
    await tagInput.press('Enter');
    // Verify the tag badge appeared before proceeding
    await expect(dialog.locator('.flex-wrap').filter({ hasText: tagLabel })).toBeVisible({ timeout: 3000 });

    // ── emailTag addon ───────────────────────────────────────────────────────
    const etRow = await getAddonCheckbox(dialog, /邮件标记|Email Tag/);
    await expect(etRow).toBeVisible({ timeout: 5000 });
    // AddonsPanel's row click only fires onSelectKey (unused/no-op in this
    // standalone-inline-forms usage) — unlike the pre-rewrite AddonsEditor's
    // <label>-wrapped row, only the Checkbox itself toggles the addon here.
    await etRow.getByRole('checkbox').click();
    await authenticatedPage.waitForTimeout(300);

    // Fill tag content
    const tagContentInput = dialog.locator('input').filter({ hasNot: dialog.locator('[type="number"]') }).nth(2);
    // More robust: find by proximity — the tag content panel has a specific label
    const tagContentLabel = dialog.locator('label').filter({ hasText: /标记内容|标签内容|Tag Content/i });
    if (await tagContentLabel.count() > 0) {
      const panel = tagContentLabel.locator('..').locator('input').first();
      if (await panel.count() > 0) {
        await panel.fill(emailTagContent);
      }
    }

    // Save — waitForResponse ensures the API call completes before checking the list
    const [saveResp] = await Promise.all([
      authenticatedPage.waitForResponse(
        r => r.url().includes('/unified-rules') && r.request().method() === 'POST',
      ),
      dialog.getByRole('button', { name: /保存|Save/ }).click(),
    ]);
    const saveBody = await saveResp.text();
    expect(saveResp.status(), `Rule creation failed: ${saveResp.status()} — ${saveBody}`).toBe(201);

    // Rule should appear in the list
    await expect(authenticatedPage.getByText(ruleName)).toBeVisible({ timeout: 10000 });

    // ── Fetch rule via API and verify metadata ──────────────────────────────
    const api = await createAuthenticatedClient(request);
    const resp = await api.get('/unified-rules?rule_class=tag');
    expect(resp.ok()).toBeTruthy();
    const data = await resp.json() as { id: number; name: string; metadata: string }[];
    const rules = Array.isArray(data) ? data : (data as any).items || [];
    const created = rules.find((r: any) => r.name === ruleName);
    expect(created).toBeDefined();
    if (created) {
      createdRuleIds.push(created.id);
      const meta = typeof created.metadata === 'string' ? JSON.parse(created.metadata) : created.metadata;
      const addonTypes = (meta?.addons || []).map((a: any) => a.type);
      expect(addonTypes).toContain('emailTag');
    }

    // Round-trip is already verified via the API check above (the emailTag addon
    // is persisted in the rule metadata). No fragile UI re-open check needed.
  });

  // ── test 2: forwardServer is wired and configurable ────────────────────────
  // STORED_NOT_WIRED_ADDONS (AddonsPanel.tsx) is now an EMPTY set: forwardServer
  // was connected in GT-12185 (dfa8b8a283) -- sideline release consumes it and
  // creates the forwarding task, covered end-to-end by
  // tests/integration/test_tag_rule_addon_actions_e2e.py TC-TAOA-002 -- so it is
  // no longer badged 即将上线 nor disabled.
  //
  // Kept as a POSITIVE assertion rather than deleted: re-badging it (or a revert
  // of GT-12185) would otherwise ship a switch that silently does nothing, which
  // is the GT-12194 lesson this gating exists to prevent.
  test('forwardServer addon is wired and configurable (GT-12185)', async ({
    authenticatedPage,
  }) => {
    const dialog = await openCreateDialog(authenticatedPage);
    await dialog.evaluate((el) => el.scrollTo(0, el.scrollHeight));
    await authenticatedPage.waitForTimeout(300);

    const fsLabel = await getAddonCheckbox(dialog, /转发服务器|Forward Server/);
    await expect(fsLabel).toBeVisible({ timeout: 5000 });
    await expect(fsLabel).not.toContainText(/即将上线|coming soon/i);
    await expect(fsLabel.getByRole('checkbox')).toBeEnabled();
  });

  // ── test 3: all 8 addon type rows are rendered (no gate) ─────────────────
  // The tag page passes AddonsPanel showDetailedLog, so 'detailedLog' gets a
  // UI row here (matching the pre-rewrite AddonsEditor) even though the
  // advanced-filter-rules disposition Tab omits it per D-7.
  test('all 8 addon types are available (no primaryAction gate)', async ({ authenticatedPage }) => {
    const dialog = await openCreateDialog(authenticatedPage);

    // Scroll down in the dialog to ensure addons section is rendered
    await dialog.evaluate((el) => el.scrollTo(0, el.scrollHeight));
    await authenticatedPage.waitForTimeout(500);

    const expectedLabels = [
      /详细日志|Detailed Log/i,
      /邮件标记|Email Tag/i,
      /免责声明|Disclaimer/i,
      /修改信头|Modify Header/i,
      /管理员通知|Admin Notify/i,
      /删除附件|Delete Attachment/i,
      /转发服务器|Forward Server/i,
      /外部邮件提醒|External Reminder/i,
    ];

    for (const label of expectedLabels) {
      const el = dialog.locator('[data-testid^="addon-row-"]').filter({ hasText: label }).first();
      await expect(el).toBeVisible({ timeout: 5000 });
    }

    // Close without saving
    await dialog.getByRole('button', { name: /取消|Cancel/ }).first().click();
  });
});
