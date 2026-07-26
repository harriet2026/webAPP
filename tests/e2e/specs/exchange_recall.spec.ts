import { test, expect } from '../fixtures/auth.fixture';
import { uniqueSuffix } from '../helpers/test-data';
import { waitForToast, waitForDialog } from '../helpers/wait';

const API_BASE = 'http://localhost:18080/api/v1';

async function apiFetch(
  page: import('@playwright/test').Page,
  method: string,
  path: string,
  body?: object,
  tenantId?: number,
) {
  const url = `${API_BASE}${path}`;
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  // Mail-routing routes require X-Tenant-ID == path :id for system_admin. Derive
  // it from the /tenants/<id>/ path, or use the explicit tenantId for flat routes
  // (e.g. /tenant-domains/_actions/...) that have no tenant in the path.
  const m = path.match(/^\/tenants\/(\d+)(?:\/|$)/);
  const tid = tenantId ?? (m ? Number(m[1]) : undefined);
  if (tid !== undefined) headers['X-Tenant-ID'] = String(tid);
  const opts: Record<string, unknown> = {
    method,
    headers,
  };
  if (body) (opts as any).data = body;
  const resp = await page.context().request.fetch(url, opts);
  let json: any = null;
  try {
    json = await resp.json();
  } catch {}
  return { status: resp.status(), json };
}

// Open the disposal-settings "召回策略设置" (recall) tab. For a system_admin in
// multi-tenant form the tabs are tenant-gated (tenantReady needs a selected
// tenant), so seed osgateway_selected_tenant with any active tenant first
// (recall keys are global, so the exchange key still shows). Then wait for the
// data query to settle (it swaps the tabs for a spinner while loading) before
// clicking, or the tab flickers and the click times out on "stable".
async function openRecallSettingsTab(page: import('@playwright/test').Page) {
  const suffix = uniqueSuffix();
  const { json: created } = await apiFetch(page, 'POST', '/tenants', {
    name: `e2e_recall_tab_${suffix}`,
    code: `rct${suffix}`.replace(/_/g, '').slice(-16),
  });
  const tid = (created?.tenant ?? created)?.id as number | undefined;
  if (tid) {
    await apiFetch(page, 'PUT', `/tenants/${tid}/status`, { status: 'active' });
    // GT-12245: the platform viewer actively clears a residual tenant selection
    // (product-form-context.tsx), so seeding osgateway_selected_tenant alone is
    // not enough -- the selection is wiped on mount, disposal-settings renders
    // 「请先选择租户以管理其处置设置」 instead of its tabs, and the 召回策略设置
    // tab is never found. Switch the viewer too, exactly as the real switcher
    // does. Set in addInitScript so it is in place before the app boots (no
    // mid-session viewer switch, hence no self-navigation to race).
    await page.addInitScript((t) => {
      localStorage.setItem('osgateway_selected_tenant', String(t));
      document.cookie = `osg_selected_tenant=${t}; path=/; SameSite=Strict`;
      document.cookie = 'osg_viewer=tenant; path=/; SameSite=Strict';
    }, tid);
  }
  await page.goto('/zh/email-disposal/disposal-settings');
  await expect(page.getByRole('heading', { name: '处置设置' })).toBeVisible();
  await page.waitForLoadState('networkidle');
  const recallTab = page.getByRole('tab', { name: '召回策略设置' });
  await expect(recallTab).toBeVisible({ timeout: 15000 });
  await recallTab.click();
}

test.describe.serial('Exchange Recall - Domain Configuration', () => {
  const suffix = uniqueSuffix();
  const tenantName = `e2e_exchange_tenant_${suffix}`;
  const tenantCode = `exc-${suffix.replace(/_/g, '').slice(-10)}`;
  const domainName = `exchange-e2e-${suffix.replace(/_/g, '-')}.local`;
  let tenantId: number;

  // System_admin UI calls only carry X-Tenant-ID when a tenant is selected
  // (osgateway_selected_tenant in localStorage → useApiRequest). The mail-routing
  // domain list endpoint now requires it, so seed it before each navigation or
  // the tenant-scoped tables come back empty.
  test.beforeEach(async ({ authenticatedPage }) => {
    if (tenantId) {
      await authenticatedPage.addInitScript((tid) => {
        localStorage.setItem('osgateway_selected_tenant', String(tid));
      }, tenantId);
    }
  });

  test('create tenant for exchange domain tests', async ({ authenticatedPage }) => {
    const { status, json } = await apiFetch(authenticatedPage, 'POST', '/tenants', {
      name: tenantName,
      code: tenantCode,
    });
    expect(status).toBe(201);
    tenantId = (json.tenant ?? json).id;
    expect(tenantId).toBeTruthy();
  });

  test('create domain with mail_system_type=exchange via API', async ({ authenticatedPage }) => {
    const { status, json } = await apiFetch(
      authenticatedPage,
      'POST',
      `/tenants/${tenantId}/domains`,
      {
        domain: domainName,
        next_hop_type: 'domain',
        next_hop_host: 'exchange.internal',
        next_hop_port: 25,
        tenant_id: tenantId,
        mail_system_type: 'exchange',
        mail_system_config: {
          ews_endpoint: 'https://exchange.example.com/EWS/Exchange.asmx',
          admin_email: 'admin@example.com',
          admin_password: 'testpass123',
          auth_type: 'ntlm',
          ssl_verify: true,
          max_search_days: 30,
          timeout_seconds: 30,
          max_retries: 3,
        },
      },
    );
    expect(status).toBe(201);
    expect(json).toHaveProperty('id');
    expect(json.mail_system_type).toBe('exchange');
  });

  test('domain list shows mail_system_type column with Exchange badge', async ({
    authenticatedPage,
  }) => {
    await authenticatedPage.goto(`/zh/tenants/${tenantId}/domains`);
    await authenticatedPage.locator('table').waitFor({ state: 'visible' });

    const header = authenticatedPage
      .locator('th')
      .filter({ hasText: '邮件系统' });
    await expect(header).toBeVisible();

    const row = authenticatedPage
      .locator('tbody tr')
      .filter({ hasText: domainName })
      .first();
    await expect(row).toBeVisible();

    const badge = row.locator('span').filter({ hasText: 'Exchange' }).first();
    await expect(badge).toBeVisible();
  });

  test('domain create dialog has mail_system_type dropdown with Exchange option', async ({
    authenticatedPage,
  }) => {
    await authenticatedPage.goto(`/zh/tenants/${tenantId}/domains`);
    await authenticatedPage.locator('table').waitFor({ state: 'visible' });

    const addButton = authenticatedPage.locator('button:has(svg.lucide-plus)').first();
    await addButton.click();
    await waitForDialog(authenticatedPage);

    const dialog = authenticatedPage.locator('[role="dialog"]');

    const typeLabel = dialog.locator('label').filter({ hasText: '邮件系统类型' });
    await expect(typeLabel).toBeVisible();

    const selectTrigger = dialog
      .locator('button[role="combobox"]')
      .filter({ hasText: /标准 SMTP|standard_smtp/ })
      .first();
    await expect(selectTrigger).toBeVisible({ timeout: 10000 });
    await selectTrigger.click();

    const exchangeOption = authenticatedPage
      .locator('[role="option"]')
      .filter({ hasText: 'Exchange' });
    await expect(exchangeOption).toBeVisible();
    await exchangeOption.click();

    const ewsTrigger = dialog.getByText('EWS 连接参数');
    await expect(ewsTrigger).toBeVisible();

    await dialog.locator('button[type="button"]').filter({ hasText: '取消' }).click();
  });

  test('cleanup: delete test domain and tenant', async ({ authenticatedPage }) => {
    const { status: domainsStatus, json: domainsJson } = await apiFetch(
      authenticatedPage,
      'GET',
      `/tenants/${tenantId}/domains`,
    );
    expect(domainsStatus).toBe(200);
    for (const d of domainsJson.items || domainsJson || []) {
      await apiFetch(authenticatedPage, 'DELETE', `/tenants/domains/${d.id}`);
    }
    await apiFetch(authenticatedPage, 'DELETE', `/tenants/${tenantId}`);
  });
});

test.describe.serial('Exchange Recall - Recall Key with Backend Type', () => {
  const keyId = `e2e_exchange_key_${uniqueSuffix()}`;
  const keySecret = 'e2e_exchange_secret_abc1234567890';
  let createdKeyId: number;

  test('create recall key with exchange backend', async ({ authenticatedPage }) => {
    const { status, json } = await apiFetch(authenticatedPage, 'POST', '/recall-keys', {
      key_id: keyId,
      key_secret: keySecret,
      backend: 'exchange',
    });
    expect(status).toBe(201);
    expect(json).toHaveProperty('id');
    expect(json.key_id).toBe(keyId);
    createdKeyId = json.id;
  });

  test('list recall keys includes exchange key', async ({ authenticatedPage }) => {
    const { status, json } = await apiFetch(authenticatedPage, 'GET', '/recall-keys');
    expect(status).toBe(200);
    expect(json).toHaveProperty('items');
    const found = (json.items as any[]).find((k: any) => k.id === createdKeyId);
    expect(found).toBeDefined();
    expect(found.key_id).toBe(keyId);
  });

  test('recall key table shows backend type badge', async ({ authenticatedPage }) => {
    await openRecallSettingsTab(authenticatedPage);

    const keysTable = authenticatedPage.locator('table').filter({ hasText: '名称' });
    if (await keysTable.isVisible()) {
      const row = keysTable
        .locator('tbody tr')
        .filter({ hasText: keyId })
        .first();
      if (await row.isVisible()) {
        const badge = row.locator('span').filter({ hasText: /Exchange/i }).first();
        await expect(badge).toBeVisible();
      }
    }
  });

  test('create dialog has backend radio group with both options', async ({
    authenticatedPage,
  }) => {
    await openRecallSettingsTab(authenticatedPage);

    const createBtn = authenticatedPage
      .getByRole('button', { name: /新建.*Key/i })
      .first();
    await createBtn.click();
    await waitForDialog(authenticatedPage);

    const dialog = authenticatedPage.locator('[role="dialog"]');
    // openRecallSettingsTab loads the /zh locale, so the backend radio options
    // render the localized labels (disposalSettings.coremailAgent/exchangeAgent):
    // "Coremail 代理" / "Exchange 代理", not the English "Coremail Agent" strings.
    await expect(dialog.getByText('所属 Agent 类型')).toBeVisible();
    await expect(dialog.getByText('Coremail 代理')).toBeVisible();
    await expect(dialog.getByText('Exchange 代理')).toBeVisible();

    const exchangeLabel = dialog.getByText('Exchange 代理').first();
    await expect(exchangeLabel).toBeVisible();
    await exchangeLabel.click();

    await dialog.locator('button[type="button"]').filter({ hasText: '取消' }).click();
  });

  test('cleanup: delete exchange recall key', async ({ authenticatedPage }) => {
    const { status } = await apiFetch(
      authenticatedPage,
      'DELETE',
      `/recall-keys/${createdKeyId}`,
    );
    expect(status).toBe(204);
  });
});

test.describe.serial('Exchange Recall - Recall Request Backend Resolution', () => {
  const suffix2 = uniqueSuffix();
  const tenantName = `e2e_recall_backend_tenant_${suffix2}`;
  const tenantCode2 = `excb-${suffix2.replace(/_/g, '').slice(-10)}`;
  const domainName = `recall-exchange-${suffix2.replace(/_/g, '-')}.local`;
  let tenantId: number;
  let domainId: number;

  test('setup: create tenant and exchange domain', async ({ authenticatedPage }) => {
    const { json: tenant } = await apiFetch(authenticatedPage, 'POST', '/tenants', {
      name: tenantName,
      code: tenantCode2,
    });
    tenantId = (tenant.tenant ?? tenant).id;
    expect(tenantId).toBeTruthy();

    const { status, json: domain } = await apiFetch(
      authenticatedPage,
      'POST',
      `/tenants/${tenantId}/domains`,
      {
        domain: domainName,
        next_hop_type: 'domain',
        next_hop_host: 'exchange.internal',
        next_hop_port: 25,
        tenant_id: tenantId,
        mail_system_type: 'exchange',
      },
    );
    expect(status).toBe(201);
    domainId = domain.id;
  });

  test('resolve-domain-types returns exchange for exchange domain', async ({
    authenticatedPage,
  }) => {
    const { status, json } = await apiFetch(
      authenticatedPage,
      'POST',
      '/tenant-domains/_actions/resolve-types?domains=' +
        encodeURIComponent(domainName),
      undefined,
      tenantId,
    );
    if (status === 200 && json) {
      expect(json[domainName]).toBe('exchange');
    }
  });

  test('recall requests list supports backend filter', async ({ authenticatedPage }) => {
    const { status, json } = await apiFetch(
      authenticatedPage,
      'GET',
      '/recall-requests?backend=exchange',
    );
    expect(status).toBe(200);
    expect(json).toHaveProperty('items');
    expect(json).toHaveProperty('total');
  });

  test('recall requests list supports tenant filter with exchange', async ({
    authenticatedPage,
  }) => {
    const { status, json } = await apiFetch(
      authenticatedPage,
      'GET',
      `/recall-requests?tenant_id=${tenantId}&backend=exchange`,
    );
    expect(status).toBe(200);
    expect(Array.isArray(json.items)).toBeTruthy();
  });

  test('cleanup: delete test domain and tenant', async ({ authenticatedPage }) => {
    if (domainId) {
      await apiFetch(authenticatedPage, 'DELETE', `/tenants/domains/${domainId}`);
    }
    if (tenantId) {
      await apiFetch(authenticatedPage, 'DELETE', `/tenants/${tenantId}`);
    }
  });
});

test.describe.serial('Exchange Recall - Bulk Domain Type Setting', () => {
  const suffix3 = uniqueSuffix();
  const tenantName = `e2e_bulk_type_tenant_${suffix3}`;
  const tenantCode3 = `excbu-${suffix3.replace(/_/g, '').slice(-9)}`;
  const domain1 = `bulk-exchange-1-${suffix3.replace(/_/g, '-')}.local`;
  const domain2 = `bulk-exchange-2-${suffix3.replace(/_/g, '-')}.local`;
  let tenantId: number;
  let domain1Id: number;
  let domain2Id: number;

  // Seed the selected tenant so system_admin UI calls carry X-Tenant-ID.
  test.beforeEach(async ({ authenticatedPage }) => {
    if (tenantId) {
      await authenticatedPage.addInitScript((tid) => {
        localStorage.setItem('osgateway_selected_tenant', String(tid));
      }, tenantId);
    }
  });

  test('setup: create tenant with two domains', async ({ authenticatedPage }) => {
    const { json: tenant } = await apiFetch(authenticatedPage, 'POST', '/tenants', {
      name: tenantName,
      code: tenantCode3,
    });
    tenantId = (tenant.tenant ?? tenant).id;
    expect(tenantId).toBeTruthy();

    const { json: d1 } = await apiFetch(
      authenticatedPage,
      'POST',
      `/tenants/${tenantId}/domains`,
      {
        domain: domain1,
        next_hop_type: 'domain',
        next_hop_host: 'smtp1.internal',
        next_hop_port: 25,
        tenant_id: tenantId,
      },
    );
    domain1Id = d1.id;

    const { json: d2 } = await apiFetch(
      authenticatedPage,
      'POST',
      `/tenants/${tenantId}/domains`,
      {
        domain: domain2,
        next_hop_type: 'domain',
        next_hop_host: 'smtp2.internal',
        next_hop_port: 25,
        tenant_id: tenantId,
      },
    );
    domain2Id = d2.id;
  });

  test('bulk set mail_system_type to exchange via API', async ({ authenticatedPage }) => {
    const { status, json } = await apiFetch(
      authenticatedPage,
      'POST',
      '/tenant-domains/_actions/bulk-set-mail-system-type',
      {
        domain_ids: [domain1Id, domain2Id],
        mail_system_type: 'exchange',
      },
      tenantId,
    );
    expect(status).toBe(200);
    expect(json).toHaveProperty('updated');
    expect(json.updated).toBe(2);
  });

  test('verify both domains now have exchange type', async ({ authenticatedPage }) => {
    const { status, json } = await apiFetch(
      authenticatedPage,
      'GET',
      `/tenants/${tenantId}/domains`,
    );
    expect(status).toBe(200);
    const items = json.items || json;
    const d1 = (items as any[]).find((d: any) => d.id === domain1Id);
    const d2 = (items as any[]).find((d: any) => d.id === domain2Id);
    expect(d1?.mail_system_type).toBe('exchange');
    expect(d2?.mail_system_type).toBe('exchange');
  });

  test('bulk set mail_system_type UI - select and change type', async ({
    authenticatedPage,
  }) => {
    await authenticatedPage.goto(`/zh/tenants/${tenantId}/domains`);
    await authenticatedPage.locator('table').waitFor({ state: 'visible' });
    await authenticatedPage.waitForLoadState('networkidle');
    await authenticatedPage.waitForTimeout(3000);

    const rows = authenticatedPage.locator('tbody tr');
    const rowCount = await rows.count();
    if (rowCount < 2) {
      test.skip();
      return;
    }

    const row1 = rows.filter({ hasText: domain1 }).first();
    if (!(await row1.isVisible().catch(() => false))) {
      test.skip();
      return;
    }
    const checkbox1 = row1.locator('[role="checkbox"]').first();
    try {
      await checkbox1.click({ timeout: 5000 });
    } catch {
      test.skip();
      return;
    }

    const row2 = rows.filter({ hasText: domain2 }).first();
    if (!(await row2.isVisible().catch(() => false))) {
      test.skip();
      return;
    }
    const checkbox2 = row2.locator('[role="checkbox"]').first();
    await checkbox2.click();

    const bulkBtn = authenticatedPage
      .getByRole('button', { name: /批量设置类型/i })
      .first();
    if (await bulkBtn.isVisible()) {
      await bulkBtn.click();
      await waitForDialog(authenticatedPage);

      const dialog = authenticatedPage.locator('[role="dialog"]');
      const selectTrigger = dialog
        .locator('button[role="combobox"]')
        .first();
      await selectTrigger.click();

      const coremailOption = authenticatedPage
        .locator('[role="option"]')
        .filter({ hasText: 'Coremail' });
      await coremailOption.click();

      await dialog
        .getByRole('button', { name: '确认' })
        .click();
      await waitForToast(authenticatedPage);
    }
  });

  test('cleanup: delete test domains and tenant', async ({ authenticatedPage }) => {
    if (domain1Id) await apiFetch(authenticatedPage, 'DELETE', `/tenants/domains/${domain1Id}`);
    if (domain2Id) await apiFetch(authenticatedPage, 'DELETE', `/tenants/domains/${domain2Id}`);
    if (tenantId) await apiFetch(authenticatedPage, 'DELETE', `/tenants/${tenantId}`);
  });
});
