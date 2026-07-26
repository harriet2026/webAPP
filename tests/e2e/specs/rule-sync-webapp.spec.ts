/**
 * Playwright E2E for Task 9b (webapp half of "规则表跨节点/跨机房应用层同步
 * Phase 1", spec design/implement/spec/2026-07-16-rule-sync-multi-site.md).
 *
 * Covers:
 *   - the replica-mode banner's core default-off invariant: this dev stack's
 *     apiserver.cf ships `[rule_sync] role = standalone` (see configs/
 *     apiserver/apiserver.cf) and no test in this suite flips it, so the
 *     banner must be absent on every rule page.
 *   - the "switch to replica" destructive confirm in config-management,
 *     including that it lists the real local global-rule count fetched from
 *     GET /api/v1/rule-sync/status.
 *   - the OSG_RULESYNC_SITE_ID env-override hint on the site_id row.
 *
 * Deliberately NOT covered here (see report): actually confirming the
 * replica switch, or verifying the live banner/403 friendly-message when
 * role === 'replica'. This dev stack's DB is shared by the entire Playwright
 * + Python E2E run; persisting `[rule_sync] role = replica` would make every
 * OTHER test in the suite that writes a global rule start failing with 403
 * replica_readonly, with no clean instant revert once picked up. Those two
 * cases are covered by mocked unit tests instead (replica-banner.test.tsx,
 * client.rule-sync-403.test.ts), which exercise the exact same code paths
 * against a fake status/error response.
 */
import { test, expect } from '../fixtures/auth.fixture';

test.describe('Rule-sync webapp (Task 9b)', () => {
  // ── Banner default-off invariant ──────────────────────────────────────────
  test('replica banner is absent on rule pages by default (standalone)', async ({ authenticatedPage }) => {
    const page = authenticatedPage;
    await page.goto('/zh/rules/mail');
    await expect(page.getByTestId('replica-mode-banner')).toHaveCount(0);
    // The banner mounts via a background react-query fetch; wait past that
    // window and re-check, so this isn't just "checked before the request
    // landed" (see the ReplicaBanner unit test's waitForSettled helper for
    // the same race this guards against).
    await page.waitForTimeout(1500);
    await expect(page.getByTestId('replica-mode-banner')).toHaveCount(0);
  });

  test('replica banner is absent on the config-management page too', async ({ authenticatedPage }) => {
    const page = authenticatedPage;
    await page.goto('/zh/rules/config-management');
    await expect(page.getByRole('heading', { name: '配置管理' })).toBeVisible();
    await page.waitForTimeout(1500);
    await expect(page.getByTestId('replica-mode-banner')).toHaveCount(0);
  });

  // ── config-management: switch-to-replica destructive confirm ─────────────
  test.describe('config-management [rule_sync] role editor', () => {
    test.beforeEach(async ({ authenticatedPage }) => {
      await authenticatedPage.goto('/zh/rules/config-management');
      await authenticatedPage.getByRole('tab', { name: 'apiserver.cf' }).click();
      await expect(
        authenticatedPage.locator('section').filter({ hasText: '[rule_sync]' }),
      ).toBeVisible();
    });

    test('typing "replica" for role and saving opens a confirm listing the local global-rule count — Cancel leaves it untouched', async ({
      authenticatedPage,
    }) => {
      const page = authenticatedPage;
      const ruleSyncSection = page.locator('section').filter({ hasText: '[rule_sync]' });
      const roleRow = ruleSyncSection.locator('tr').filter({ hasText: 'role' }).first();
      await roleRow.getByRole('button', { name: '编辑' }).click();

      const valueField = page.locator('div.space-y-1').filter({ hasText: '覆盖值' }).locator('input');
      await valueField.fill('replica');
      await page.getByRole('button', { name: '保存' }).click();

      // The destructive confirm must mention a concrete rule count, not a
      // generic "are you sure" — this is the number the spec requires
      // (design/implement/spec/2026-07-16-rule-sync-multi-site.md §2).
      const confirmDialog = page.getByRole('alertdialog');
      await expect(confirmDialog).toBeVisible();
      await expect(confirmDialog).toContainText(/\d+ 条全局规则/);
      await expect(confirmDialog).toContainText('replica');

      // Deliberately Cancel the destructive confirm itself — see file header
      // for why this test never lets the switch reach the primary/apiserver.
      // Cancel only dismisses the confirm (ConfirmDialog's onOpenChange),
      // NOT the underlying edit form — confirmReplicaSwitch (the only path
      // that calls performSave) is never invoked, so no override is written.
      await confirmDialog.getByRole('button', { name: '取消' }).click();
      await expect(confirmDialog).toBeHidden();

      // Back out of the still-open edit form too, so nothing is left
      // pending, then verify the edit dialog is fully gone.
      await page.getByRole('button', { name: '取消' }).click();
      await expect(page.getByRole('button', { name: '保存' })).toHaveCount(0);
    });

    // Uses sync_interval_seconds rather than `role` for the "unrelated edit"
    // case: only `role` -> `replica` should ever trigger the destructive
    // confirm gate (isSwitchingToReplica in page.tsx checks the exact key AND
    // value), and editing any other key in the same [rule_sync] section is a
    // clean way to prove that without touching `role` on the shared dev DB
    // at all — sync_interval_seconds only matters once role=replica, so it
    // is fully inert on this standalone dev node either way.
    test('editing an unrelated [rule_sync] key (sync_interval_seconds) saves immediately with no destructive confirm', async ({
      authenticatedPage,
    }) => {
      const page = authenticatedPage;
      const ruleSyncSection = page.locator('section').filter({ hasText: '[rule_sync]' });
      const intervalRow = ruleSyncSection.locator('tr').filter({ hasText: 'sync_interval_seconds' }).first();
      await intervalRow.getByRole('button', { name: '编辑' }).click();

      const valueField = page.locator('div.space-y-1').filter({ hasText: '覆盖值' }).locator('input');
      await valueField.fill('301');
      await page.getByRole('button', { name: '保存' }).click();

      await expect(page.getByRole('alertdialog')).toHaveCount(0);
      await expect(page.getByRole('button', { name: '保存' })).toHaveCount(0, { timeout: 10000 });

      // Clean up the override this test just created, so the shared dev DB
      // is left exactly as this test found it.
      await expect(intervalRow.getByText('301')).toBeVisible();
      await intervalRow.getByRole('button', { name: '删除' }).click();
      const deleteConfirm = page.getByRole('alertdialog');
      await expect(deleteConfirm).toBeVisible();
      await deleteConfirm.getByRole('button', { name: '确认' }).click();
      await expect(intervalRow.getByText('301')).toHaveCount(0);
    });

    // ── site_id env-override hint ───────────────────────────────────────────
    test('editing site_id shows the OSG_RULESYNC_SITE_ID env-override hint', async ({ authenticatedPage }) => {
      const page = authenticatedPage;
      const ruleSyncSection = page.locator('section').filter({ hasText: '[rule_sync]' });
      const siteIdRow = ruleSyncSection.locator('tr').filter({ hasText: 'site_id' }).first();

      await expect(page.getByTestId('rule-sync-site-id-hint')).toHaveCount(0);
      await siteIdRow.getByRole('button', { name: '编辑' }).click();
      await expect(page.getByTestId('rule-sync-site-id-hint')).toBeVisible();
      await expect(page.getByTestId('rule-sync-site-id-hint')).toContainText('OSG_RULESYNC_SITE_ID');

      // Cancel — read-only exploration of the hint, no save.
      await page.getByRole('button', { name: '取消' }).click();
    });

    test('editing role does NOT show the site_id hint (scoped to the site_id key only)', async ({
      authenticatedPage,
    }) => {
      const page = authenticatedPage;
      const ruleSyncSection = page.locator('section').filter({ hasText: '[rule_sync]' });
      const roleRow = ruleSyncSection.locator('tr').filter({ hasText: 'role' }).first();
      await roleRow.getByRole('button', { name: '编辑' }).click();
      await expect(page.getByTestId('rule-sync-site-id-hint')).toHaveCount(0);
      await page.getByRole('button', { name: '取消' }).click();
    });
  });
});

// ── Banner POSITIVE path, via route interception ────────────────────────────
//
// The suite header explains why the positive path was left uncovered:
// persisting `[rule_sync] role = replica` in this shared dev stack would make
// every other test that writes a global rule start failing with 403
// replica_readonly, with no clean instant revert. That reasoning is sound —
// but it only rules out changing the SERVER's role. Intercepting
// GET /api/v1/rule-sync/status for this page alone renders the banner against
// the real component, the real rules layout, and the real i18n bundle, with
// zero DB impact and zero effect on any other spec.
//
// This closes §4.4's only gap: before it, the banner's rendered output was
// asserted exclusively in jsdom (replica-banner.test.tsx). A component can
// pass jsdom and still be invisible or mislaid in the real layout — the
// ReplicaBanner in particular relies on a mb-8/-mt-8 interaction with
// PageHeader that jsdom cannot see at all.
test.describe('Rule-sync replica banner (mocked status)', () => {
  const replicaStatus = {
    role: 'replica',
    site_id: 'site-bj',
    primary_addr: 'https://primary.hz.example.com:8081',
    last_success_at: '2026-07-17T02:00:00Z',
    last_error: null,
    last_error_at: null,
    last_applied_generation: 42,
    generation: 0,
    global_rule_count: 7,
    stale: false,
    stale_after_seconds: 900,
  };

  test('renders on a rule page when the node is a replica, naming the primary', async ({
    authenticatedPage,
  }) => {
    const page = authenticatedPage;
    await page.route('**/api/v1/rule-sync/status', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(replicaStatus),
      }),
    );

    await page.goto('/zh/rules/mail');

    const banner = page.getByTestId('replica-mode-banner');
    await expect(banner).toBeVisible();
    await expect(banner).toContainText('副本模式');
    // The primary's address is the actionable half: the banner exists so an
    // admin who cannot edit rules here knows where they CAN.
    await expect(banner).toContainText('https://primary.hz.example.com:8081');
    await expect(banner).toContainText('最后同步');

    // It must not push the page header off-screen or overlap it: the banner
    // sits above a PageHeader whose -mt-8 cancels the banner's mb-8. jsdom
    // cannot see this; a real browser can.
    const heading = page.getByRole('heading').first();
    await expect(heading).toBeVisible();
    const bannerBox = await banner.boundingBox();
    const headingBox = await heading.boundingBox();
    expect(bannerBox).not.toBeNull();
    expect(headingBox).not.toBeNull();
    expect(bannerBox!.y + bannerBox!.height).toBeLessThanOrEqual(headingBox!.y + 1);
  });

  test('shows the never-synced fallback when the replica has not synced yet', async ({
    authenticatedPage,
  }) => {
    const page = authenticatedPage;
    await page.route('**/api/v1/rule-sync/status', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        // stale: true is what the real handler returns for last_success_at =
        // null (ruleSyncStale), so the mock says it too — a fixture that
        // disagreed with the server it stands in for would be testing a state
        // the product cannot actually produce.
        body: JSON.stringify({ ...replicaStatus, last_success_at: null, stale: true }),
      }),
    );

    await page.goto('/zh/rules/mail');

    const banner = page.getByTestId('replica-mode-banner');
    await expect(banner).toBeVisible();
    // A fresh replica that has never synced is exactly when an admin most
    // needs the truth; rendering an empty/Invalid Date here would be worse
    // than useless.
    await expect(banner).toContainText('尚未同步');
    await expect(banner).not.toContainText('Invalid Date');
    await expect(banner).toHaveAttribute('data-stale', 'true');
  });

  // Spec §4.4's "同步滞后超阈值变红", in a real browser. jsdom already asserts the
  // class string and the data-stale hook (replica-banner.test.tsx); what only a
  // real browser can show is that those classes COMPILE into the stylesheet and
  // actually repaint the element — a Tailwind class can survive every string
  // check and still never reach the page.
  //
  // The assertion is "the two states paint differently", deliberately, rather
  // than "the stale one is red". Reading redness out of getComputedStyle means
  // parsing whatever colour space Tailwind emits: it serializes these as
  // `lab(97.3623 -2.33802 -4.13098)` today, so the obvious
  // `bg.match(/\d+/g)` → [r,g,b] parse silently yields [97, 2, 33802] and any
  // channel comparison built on it is true for every possible colour — a test
  // that passes just as well with the feature deleted. Comparing the two
  // rendered states against each other needs no colour model at all and cannot
  // go vacuous that way.
  test('paints the stale and fresh states differently in a real browser', async ({
    authenticatedPage,
  }) => {
    const page = authenticatedPage;
    let stale = false;
    await page.route('**/api/v1/rule-sync/status', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ ...replicaStatus, stale }),
      }),
    );
    const bannerBackground = async () => {
      const banner = page.getByTestId('replica-mode-banner');
      await expect(banner).toBeVisible();
      return banner.evaluate((el) => getComputedStyle(el).backgroundColor);
    };

    await page.goto('/zh/rules/mail');
    const banner = page.getByTestId('replica-mode-banner');
    await expect(banner).toHaveAttribute('data-stale', 'false');
    await expect(banner).not.toContainText('同步滞后');
    const freshBg = await bannerBackground();

    stale = true;
    await page.reload();
    await expect(banner).toHaveAttribute('data-stale', 'true');
    // Colour alone is not an explanation, and is nothing at all to a
    // colour-blind or screen-reader user: the reason must be in the text.
    await expect(banner).toContainText('同步滞后');
    const staleBg = await bannerBackground();

    expect(freshBg, 'the banner must have a real background in both states').toBeTruthy();
    expect(staleBg).not.toBe('rgba(0, 0, 0, 0)');
    expect(
      staleBg,
      `a lagging replica must not be painted like a healthy one (both rendered as ${staleBg})`,
    ).not.toBe(freshBg);
  });

  // Anti-vacuity: the interception itself must not be what makes the banner
  // appear. A standalone status through the SAME mock must render nothing.
  test('stays absent when the mocked status reports standalone', async ({ authenticatedPage }) => {
    const page = authenticatedPage;
    await page.route('**/api/v1/rule-sync/status', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ ...replicaStatus, role: 'standalone', primary_addr: '' }),
      }),
    );

    await page.goto('/zh/rules/mail');
    await page.waitForTimeout(1500);
    await expect(page.getByTestId('replica-mode-banner')).toHaveCount(0);
  });
});
