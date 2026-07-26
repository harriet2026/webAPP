import type { Locator, Page } from '@playwright/test';
import { test, expect } from '../fixtures/auth.fixture';

// Module A (policy pipeline) is tenant-scoped: the platform admin is blocked in
// the multi-tenant dev form (GT-12149 / PRD §1.4), so drive the UI as a tenant_admin.




/**
 * Mock-mode rewrite (Task E1). The docker apiserver (:18080) backing this
 * runner is a stale image predating the demo-aligned overseas-mail UI + GeoIP
 * library: it still returns the OLD default config (all directions off,
 * `quarantine`) and has no `/geoip-rules` CRUD endpoints at all. Rather than
 * couple this spec to that stale backend, every test here flips on the
 * client-side mock (`osgateway_mock_enabled` in localStorage — see
 * src/lib/mock/{storage,dispatcher,fixtures}.ts) so `/overseas-mail/config`
 * and `/geoip-rules` are served entirely from an in-memory fixture. The
 * real-backend/DB-persisted behavior is covered by Go tests, not here.
 *
 * Mock defaults exercised below (src/lib/mock/fixtures.ts):
 *  - overseas-mail config: inbound enabled+block, outbound/internal disabled+block.
 *  - geoip-rules: exactly 35 rows, page size 10 (pages of 10/10/10/5), full
 *    create/update/delete against an in-memory array (resets on full page
 *    reload since it's just a JS module-level variable in the browser tab).
 */

async function openOverseasMailDrawer(page: Page, locale: 'zh' | 'en' = 'zh'): Promise<Locator> {
  // addInitScript only takes effect on the *next* navigation. The
  // authenticatedPage fixture already did a real login (against the real
  // backend, so the HttpOnly auth cookies are genuine) before this test body
  // runs; the goto below is the navigation this init script attaches to.
  await page.addInitScript(() => {
    window.localStorage.setItem('osgateway_mock_enabled', '1');
  });
  // 海外邮件检测 is a connection-layer (stage-1) policy. Stage 1 is platform-
  // managed: the tenant pipeline explicitly renders "「阶段1：IP策略」由平台统一
  // 管控" and omits those cards, while a platform admin gets no pipeline cards at
  // all (Module A is tenant-only, GT-12149). So the pipeline route reaches this
  // module for NO role now — it lives on the platform-security page's connection
  // layer (ConnectionLayerPanel -> <OverseasMailPage embedded />), which is
  // gated on manage_tenants, i.e. the platform admin this spec now runs as.
  await page.goto(`/${locale}/system/platform-security`);
  await page.waitForLoadState('networkidle');

  const moduleBtn = page.getByRole('button', { name: locale === 'zh' ? '海外邮件检测' : /Overseas/i }).first();
  await expect(moduleBtn).toBeVisible({ timeout: 10000 });
  await moduleBtn.click();

  // Scope everything to the module wrapper (ModuleMasterSwitch page="overseas_mail"),
  // which is what the drawer used to provide.
  const dialog = page.getByTestId('module-master-switch-overseas_mail');
  await expect(dialog).toBeVisible({ timeout: 10000 });
  // `/security/modules` (module master switch) isn't in the mock route table
  // so it always hits the real backend; give it a beat to settle before
  // asserting on module-content interactivity.
  await page.waitForTimeout(500);
  return dialog;
}

// The dialog holds the module master switch (ModuleMasterSwitch) FOLLOWED BY
// the three direction switches, in DIRECTIONS order: inbound, outbound,
// internal. `dialog.getByRole('switch').first()` would be the MASTER toggle,
// not inbound — always scope direction switches to the module content region.
function directionSwitches(dialog: Locator): Locator {
  return dialog.getByTestId('module-content-overseas_mail').getByRole('switch');
}

// GeoIpLibraryTable's rows carry no data-testid and share the same <Table>
// primitive as the 3 direction rows above them, so distinguish them by their
// IP-range-shaped cell content (e.g. "8.8.8.0/24").
function geoipRows(dialog: Locator): Locator {
  return dialog.locator('table tbody tr').filter({ hasText: /\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\/\d{1,2}/ });
}

test.describe('Overseas Mail Detection (mock mode)', () => {
  test.describe('direction table', () => {
    test('default state: inbound enabled+block, outbound/internal disabled', async ({ authenticatedPage }) => {
      const dialog = await openOverseasMailDrawer(authenticatedPage);

      await expect(dialog.getByTestId('direction-row-inbound')).toHaveAttribute('data-enabled', 'true');
      await expect(dialog.getByTestId('direction-row-outbound')).toHaveAttribute('data-enabled', 'false');
      await expect(dialog.getByTestId('direction-row-internal')).toHaveAttribute('data-enabled', 'false');

      const inboundAction = dialog.getByTestId('direction-action-inbound');
      await expect(inboundAction).toBeEnabled();
      await expect(inboundAction).toHaveText(/阻断|Block/);
      await expect(dialog.getByTestId('direction-effect-inbound')).toHaveText(
        /命中时执行「阻断」|Execute "Block" on hit/
      );

      for (const dir of ['outbound', 'internal']) {
        const action = dialog.getByTestId(`direction-action-${dir}`);
        await expect(action, dir).toHaveText(/^--/);
        await expect(action, dir).toBeDisabled();
        await expect(dialog.getByTestId(`direction-effect-${dir}`), dir).toHaveText(
          /该方向邮件跳过海外检测|Skip overseas detection/
        );
      }
    });

    test('direction table shows three rows plus the module master switch', async ({ authenticatedPage }) => {
      const dialog = await openOverseasMailDrawer(authenticatedPage);

      await expect(dialog.getByTestId('master-switch-toggle')).toHaveCount(1);
      await expect(directionSwitches(dialog)).toHaveCount(3);

      await expect(dialog.getByText(/收件方向|Inbound/).first()).toBeVisible();
      await expect(dialog.getByText(/外发方向|Outbound/).first()).toBeVisible();
      await expect(dialog.getByText(/域内方向|Internal/).first()).toBeVisible();
    });

    test('enabling outbound reveals its pre-selected action and effect', async ({ authenticatedPage }) => {
      const dialog = await openOverseasMailDrawer(authenticatedPage);

      await directionSwitches(dialog).nth(1).click();

      await expect(dialog.getByTestId('direction-row-outbound')).toHaveAttribute('data-enabled', 'true');
      const action = dialog.getByTestId('direction-action-outbound');
      await expect(action).toBeEnabled();
      await expect(action).toHaveText(/阻断|Block/);
      await expect(dialog.getByTestId('direction-effect-outbound')).toHaveText(
        /命中时执行「阻断」|Execute "Block" on hit/
      );
    });

    test('toggling inbound off hides its action and marks the row skipped', async ({ authenticatedPage }) => {
      const dialog = await openOverseasMailDrawer(authenticatedPage);

      await directionSwitches(dialog).nth(0).click();

      await expect(dialog.getByTestId('direction-row-inbound')).toHaveAttribute('data-enabled', 'false');
      const action = dialog.getByTestId('direction-action-inbound');
      await expect(action).toBeDisabled();
      await expect(action).toHaveText(/^--/);
      await expect(dialog.getByTestId('direction-effect-inbound')).toHaveText(
        /该方向邮件跳过海外检测|Skip overseas detection/
      );
    });

    test('action dropdown change updates the effect text', async ({ authenticatedPage }) => {
      const dialog = await openOverseasMailDrawer(authenticatedPage);

      const trigger = dialog.getByTestId('direction-action-inbound');
      await trigger.click();
      await authenticatedPage.getByRole('option', { name: '隔离', exact: true }).click();

      await expect(trigger).toHaveText(/隔离|Quarantine/);
      await expect(dialog.getByTestId('direction-effect-inbound')).toHaveText(
        /命中时执行「隔离」|Execute "Quarantine" on hit/
      );
    });

    test('enabling internal shows the amber internal-direction warning', async ({ authenticatedPage }) => {
      const dialog = await openOverseasMailDrawer(authenticatedPage);

      await directionSwitches(dialog).nth(2).click();

      await expect(
        dialog.getByText(/启用域内方向可能影响 VPN\/远程办公用户的正常邮件|Enabling internal direction may affect VPN\/remote users/)
      ).toBeVisible();
    });

    test('turning all directions off shows the all-disabled info alert', async ({ authenticatedPage }) => {
      const dialog = await openOverseasMailDrawer(authenticatedPage);

      // Only inbound is enabled by default; switching it off leaves all three off.
      await directionSwitches(dialog).nth(0).click();

      await expect(
        dialog.getByText(/所有方向均已禁用，海外邮件检测将不生效|All directions disabled, overseas detection is inactive/)
      ).toBeVisible();
    });

    test('manual save: dirty banner appears until saved', async ({ authenticatedPage }) => {
      const dialog = await openOverseasMailDrawer(authenticatedPage);

      await expect(dialog.getByTestId('overseas-unsaved-bar')).toHaveCount(0);

      await directionSwitches(dialog).nth(1).click(); // enable outbound
      const banner = dialog.getByTestId('overseas-unsaved-bar');
      await expect(banner).toBeVisible();
      await expect(banner).toContainText(/有未保存的更改|unsaved changes/i);

      // Mock mode short-circuits the client before any real network request,
      // so waitForResponse would never fire — assert on the UI outcome instead:
      // the unsaved banner clears once the (mock) save resolves.
      await banner.getByRole('button', { name: /保存|Save/ }).click();
      await expect(dialog.getByTestId('overseas-unsaved-bar')).toHaveCount(0);
    });

    test('language switching shows English direction labels', async ({ authenticatedPage }) => {
      const dialog = await openOverseasMailDrawer(authenticatedPage, 'en');

      await expect(dialog.getByText('Inbound').first()).toBeVisible();
      await expect(dialog.getByText('Outbound').first()).toBeVisible();
      await expect(dialog.getByText('Internal').first()).toBeVisible();
      await expect(dialog.getByTestId('direction-action-inbound')).toHaveText(/Block/);
    });
  });

  test.describe('GeoIP library (custom IP geolocation database)', () => {
    test('lists 35 rows across 4 pages of 10/10/10/5', async ({ authenticatedPage }) => {
      const dialog = await openOverseasMailDrawer(authenticatedPage);

      await expect(geoipRows(dialog)).toHaveCount(10);
      await expect(dialog.getByText(/第\s*1\s*\/\s*4\s*页|Page\s*1\s*\/\s*4/)).toBeVisible();

      await dialog.getByRole('button', { name: /^下一页$|^Next$/ }).click();
      await expect(dialog.getByText(/第\s*2\s*\/\s*4\s*页|Page\s*2\s*\/\s*4/)).toBeVisible();
      await expect(geoipRows(dialog)).toHaveCount(10);

      await dialog.getByRole('button', { name: /^下一页$|^Next$/ }).click();
      await dialog.getByRole('button', { name: /^下一页$|^Next$/ }).click();
      await expect(dialog.getByText(/第\s*4\s*\/\s*4\s*页|Page\s*4\s*\/\s*4/)).toBeVisible();
      await expect(geoipRows(dialog)).toHaveCount(5);
      await expect(dialog.getByRole('button', { name: /^下一页$|^Next$/ })).toBeDisabled();
    });

    test('search narrows results to a matching rule', async ({ authenticatedPage }) => {
      const dialog = await openOverseasMailDrawer(authenticatedPage);

      await dialog.getByPlaceholder(/搜索IP或地区代码|Search IP or region code/).fill('8.8.8.0/24');
      await expect(geoipRows(dialog)).toHaveCount(1);
      await expect(dialog.getByText('8.8.8.0/24')).toBeVisible();
      await expect(dialog.getByText('Google DNS')).toBeVisible();

      await dialog.getByRole('button', { name: /^重置$|^Reset$/ }).click();
      await expect(geoipRows(dialog)).toHaveCount(10);
    });

    test('creating a rule validates required fields, then succeeds', async ({ authenticatedPage }) => {
      const dialog = await openOverseasMailDrawer(authenticatedPage);

      await dialog.getByRole('button', { name: '新增规则', exact: true }).click();
      const sheet = authenticatedPage.getByRole('dialog', { name: '新增规则', exact: true });
      await expect(sheet).toBeVisible();

      // GT-12103: the 保存 button is disabled until a valid IP/CIDR AND a region are
      // present (prevents illegal records reaching the DB), so an empty submit is no
      // longer possible. Assert the gating instead of an empty-submit error surface.
      const saveBtn = sheet.getByRole('button', { name: '保存', exact: true });
      await expect(saveBtn).toBeDisabled();

      await sheet.getByPlaceholder(/请输入IP地址或CIDR网段/).fill('1.2.3.0/24');
      // IP alone is not enough — region still required, so save stays disabled.
      await expect(saveBtn).toBeDisabled();

      await sheet.getByRole('combobox').click();
      await authenticatedPage.getByRole('option', { name: '日本 (JP)', exact: true }).click();
      // Region-name auto-fill only happens in create mode, before any manual edit.
      await expect(sheet.getByPlaceholder(/如「Google DNS」/)).toHaveValue('日本');

      // Now valid: save enabled. Mock mode: no real network response to await —
      // assert the sheet closes and (below) the new row appears after the mock
      // create + list-refetch land.
      await expect(saveBtn).toBeEnabled();
      await saveBtn.click();
      await expect(sheet).toBeHidden();

      await dialog.getByPlaceholder(/搜索IP或地区代码/).fill('1.2.3.0/24');
      await expect(dialog.getByText('1.2.3.0/24')).toBeVisible();
      await expect(dialog.getByText('日本').first()).toBeVisible();
    });

    test('editing an existing rule updates its region name', async ({ authenticatedPage }) => {
      const dialog = await openOverseasMailDrawer(authenticatedPage);

      const row = dialog.getByRole('row', { name: /8\.8\.8\.0\/24/ });
      await row.getByRole('button').first().click(); // Pencil (edit)

      const sheet = authenticatedPage.getByRole('dialog', { name: '编辑映射', exact: true });
      await expect(sheet).toBeVisible();

      const ipInput = sheet.getByPlaceholder(/请输入IP地址或CIDR网段/);
      await expect(ipInput).toHaveValue('8.8.8.0/24');
      await expect(ipInput).toBeDisabled(); // IP range is immutable once created

      const regionNameInput = sheet.getByPlaceholder(/如「Google DNS」/);
      await expect(regionNameInput).toHaveValue('Google DNS');
      await regionNameInput.fill('Google Public DNS');

      // Mock mode: assert the sheet closes and the updated region name appears.
      await sheet.getByRole('button', { name: '保存', exact: true }).click();
      await expect(sheet).toBeHidden();

      await expect(dialog.getByText('Google Public DNS')).toBeVisible();
    });

    test('deleting a rule removes it from the library', async ({ authenticatedPage }) => {
      const dialog = await openOverseasMailDrawer(authenticatedPage);

      await dialog.getByPlaceholder(/搜索IP或地区代码/).fill('103.0.0.0/8');
      await expect(geoipRows(dialog)).toHaveCount(1);

      const row = dialog.getByRole('row', { name: /103\.0\.0\.0\/8/ });
      await row.getByRole('button').last().click(); // Trash (delete)

      const confirmDialog = authenticatedPage.getByRole('alertdialog', { name: /^删除$|^Delete$/ });
      await expect(confirmDialog).toBeVisible();
      await expect(confirmDialog.getByText(/确定要删除吗|Are you sure/)).toBeVisible();

      // Mock mode: assert the UI outcome (empty state) after the mock delete.
      await confirmDialog.getByRole('button', { name: /^确认$|^Confirm$/ }).click();

      // The search term still narrows to the (now deleted) row, so the
      // library falls back to its empty state rather than a stale row.
      await expect(dialog.getByText(/暂无自定义IP规则|No custom IP rules yet/)).toBeVisible();
    });
  });
});
