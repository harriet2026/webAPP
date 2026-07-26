import { readFile } from 'node:fs/promises';
import type { APIRequestContext, Page } from '@playwright/test';
import { test, expect } from '../fixtures/auth.fixture';
import { createTenant, deleteTenant, getAdminToken } from '../helpers/seed-data';
import { uniqueSuffix } from '../helpers/test-data';
import { waitForToast } from '../helpers/wait';

const API_BASE = 'http://localhost:18080/api/v1';

type RuleExportEnvelope = {
  version: string;
  exported_at: string;
  scope: string;
  tenant_context: {
    mode: string;
    tenant_id?: number;
    tenant_name?: string;
  };
  data: {
    rules?: Array<Record<string, unknown>>;
    detection_profiles?: Array<Record<string, unknown>>;
    bounce_dsn_settings?: Array<Record<string, unknown>>;
  };
};

async function apiPost(request: APIRequestContext, token: string, path: string, data: unknown) {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${token}`,
  };
  // Mail-routing routes require X-Tenant-ID == path :id for system_admin; derive
  // it from the /tenants/<id>/ path so domain-management POSTs are accepted.
  const m = path.match(/^\/tenants\/(\d+)(?:\/|$)/);
  if (m) headers['X-Tenant-ID'] = m[1];
  return request.post(`${API_BASE}${path}`, {
    data,
    headers,
  });
}

async function apiGet(request: APIRequestContext, token: string, path: string) {
  return request.get(`${API_BASE}${path}`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });
}

// The bounce-DSN list endpoint was retired along with its admin page, so
// reading that group back now goes through the export endpoint — which is
// also what the dialog under test drives.
async function exportSettings(request: APIRequestContext, token: string, tenantId: number) {
  const qs = new URLSearchParams({
    include_rules: 'false',
    include_detection_profiles: 'false',
    include_bounce_dsn_settings: 'true',
  });
  const resp = await request.get(`${API_BASE}/unified-rules/export?${qs}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      'X-Tenant-ID': String(tenantId),
    },
  });
  return resp;
}

// The bounce-DSN admin page and its CRUD endpoints were retired, so this
// suite seeds that group through the import endpoint — the same path the
// dialog under test drives, and now the only way to create it. `data`
// carries only the groups being seeded; `selection` must enable exactly
// those, since the importer ignores groups that are not selected.
async function seedSettingsViaImport(
  request: APIRequestContext,
  token: string,
  tenantId: number,
  tenantName: string,
  data: RuleExportEnvelope['data'],
) {
  return apiPost(request, token, '/unified-rules/import', {
    file: {
      version: 'rule-settings/v1',
      exported_at: new Date().toISOString(),
      scope: 'tenant',
      tenant_context: { mode: 'selected', tenant_id: tenantId, tenant_name: tenantName },
      data,
    },
    selection: {
      include_rules: false,
      include_detection_profiles: false,
      include_bounce_dsn_settings: Array.isArray(data.bounce_dsn_settings),
    },
    import_mode: { mode: 'import_to_selected_tenant', target_tenant_id: tenantId },
    duplicate_resolutions: {},
  });
}

async function selectTenantInBrowser(page: Page, tenantId: number) {
  await page.goto('/zh/dashboard', { waitUntil: 'networkidle' });
  // GT-12245: the platform viewer actively clears a residual tenant selection
  // (product-form-context.tsx), so localStorage alone does not survive the
  // reload below -- the export then falls back to platform scope and the
  // assertion reads scope="admin" instead of "tenant". Switch the viewer too,
  // as the real tenant switcher does.
  await page.evaluate((nextTenantId) => {
    localStorage.setItem('osgateway_selected_tenant', String(nextTenantId));
    document.cookie = `osg_selected_tenant=${nextTenantId}; path=/; SameSite=Strict`;
    document.cookie = 'osg_viewer=tenant; path=/; SameSite=Strict';
  }, tenantId);
  await page.reload({ waitUntil: 'networkidle' });
}

function importExportDialog(page: Page) {
  return page.getByRole('dialog', { name: /导入与导出|import and export/i });
}

async function scrollDialog(page: Page, dialog: ReturnType<typeof importExportDialog>, deltaY: number) {
  await dialog.hover();
  await page.mouse.wheel(0, deltaY);
}

test.describe.serial('Rule settings import/export', () => {
  const suffix = uniqueSuffix();
  const ds = suffix.replace(/_/g, '-'); // domain-safe suffix
  const tenantName = `rule-import-export-${suffix}`;
  const tenantDomain = `rule-ie-${ds}.local`;
  const existingRuleName = `rule-export-existing-${suffix}`;
  const existingProfileName = `rbl-export-${ds}.test`;
  const existingBounceDomain = `bounce-existing-${ds}.local`;
  const duplicateProfileName = `profile-import-duplicate-${suffix}`;
  const importedProfileName = `profile-import-new-${suffix}`;
  const unselectedRuleName = `rule-import-unselected-${suffix}`;
  const unselectedBounceDomain = `bounce-import-unselected-${ds}.local`;

  let token = '';
  let tenantId = 0;

  test.beforeAll(async ({ request }) => {
    token = await getAdminToken(request);
    tenantId = await createTenant(request, token, tenantName);

    const domainResp = await apiPost(request, token, `/tenants/${tenantId}/domains`, {
      domain: tenantDomain,
      next_hop_type: 'domain',
      next_hop_host: 'smtpsink',
      next_hop_port: 25,
    });
    expect([200, 201]).toContain(domainResp.status());

    const bounceDomainResp = await apiPost(request, token, `/tenants/${tenantId}/domains`, {
      domain: existingBounceDomain,
      next_hop_type: 'domain',
      next_hop_host: 'smtpsink',
      next_hop_port: 25,
    });
    expect([200, 201]).toContain(bounceDomainResp.status());

    const existingRuleResp = await apiPost(request, token, '/unified-rules', {
      tenant_id: tenantId,
      name: existingRuleName,
      description: 'seeded for export verification',
      rule_class: 'action',
      stage: 'data',
      action: 'reject',
      priority: 100,
      condition_tree: {
        type: 'AND',
        children: [{ type: 'condition', field: 'sender', operator: 'suffix', value: '@seed.local' }],
      },
      is_active: true,
      metadata: {},
    });
    expect(existingRuleResp.status()).toBe(201);

    const existingProfileResp = await apiPost(request, token, '/detection-profiles', {
      tenant_id: tenantId,
      config_type: 'exec_impersonation',
      name: existingProfileName,
      value: '',
      is_active: true,
    });
    expect(existingProfileResp.status()).toBe(201);

    const duplicateProfileResp = await apiPost(request, token, '/detection-profiles', {
      tenant_id: tenantId,
      config_type: 'exec_impersonation',
      name: duplicateProfileName,
      value: 'chief executive officer',
      is_active: true,
    });
    expect(duplicateProfileResp.status()).toBe(201);

    const settingsResp = await seedSettingsViaImport(request, token, tenantId, tenantName, {
      bounce_dsn_settings: [
        {
          tenant_id: tenantId,
          domain: existingBounceDomain,
          enabled: true,
          language: 'en',
          include_original_headers: true,
        },
      ],
    });
    expect(settingsResp.status()).toBe(200);
  });

  test.afterAll(async ({ request }) => {
    if (tenantId) {
      await deleteTenant(request, token, tenantId);
    }
  });

  test('exports selected tenant data as a versioned grouped JSON download', async ({ authenticatedPage }) => {
    await selectTenantInBrowser(authenticatedPage, tenantId);
    await authenticatedPage.goto('/zh/rules/data', { waitUntil: 'networkidle' });

    await authenticatedPage.getByRole('button', { name: /导入\s*\/\s*导出|import\s*\/\s*export/i }).click();
    const dialog = importExportDialog(authenticatedPage);
    await expect(dialog).toBeVisible();

    const [download] = await Promise.all([
      authenticatedPage.waitForEvent('download'),
      dialog.getByRole('button', { name: /导出设置|Export settings/ }).click(),
    ]);

    await waitForToast(authenticatedPage);
    const downloadPath = await download.path();
    expect(downloadPath).toBeTruthy();

    const raw = await readFile(downloadPath!, 'utf8');
    const exported = JSON.parse(raw) as RuleExportEnvelope;

    expect(exported.version).toBe('rule-settings/v1');
    expect(exported.scope).toBe('tenant');
    expect(exported.tenant_context.tenant_id).toBe(tenantId);
    expect(exported.data.rules?.some((rule) => rule.name === existingRuleName)).toBe(true);
    expect(exported.data.detection_profiles?.some((profile) => profile.name === existingProfileName)).toBe(true);
    expect(exported.data.bounce_dsn_settings?.some((setting) => setting.domain === existingBounceDomain)).toBe(true);
  });

  test('previews duplicates, expands details, and imports only selected groups', async ({ authenticatedPage, request }) => {
    // The preview dialog grows with the number of parsed groups and, at the
    // default 720px-high viewport, ends up taller than the window: 查看详情 then
    // sits outside the VIEWPORT no matter how far the dialog's own scroller is
    // moved, and the click retries until the test times out. Give it a taller
    // window instead of forcing the click, so the element is genuinely reachable
    // the way a user would reach it.
    await authenticatedPage.setViewportSize({ width: 1280, height: 1000 });
    const importEnvelope: RuleExportEnvelope = {
      version: 'rule-settings/v1',
      exported_at: new Date().toISOString(),
      scope: 'tenant',
      tenant_context: {
        mode: 'selected',
        tenant_id: tenantId,
        tenant_name: tenantName,
      },
      data: {
        rules: [
          {
            tenant_id: tenantId,
            name: unselectedRuleName,
            description: 'should stay unimported',
            rule_class: 'action',
            stage: 'data',
            action: 'reject',
            priority: 120,
            condition_tree: JSON.stringify({
              type: 'AND',
              children: [{ type: 'condition', field: 'sender', operator: 'suffix', value: '@unselected.local' }],
            }),
            metadata: '{}',
            is_active: true,
          },
        ],
        detection_profiles: [
          {
            tenant_id: tenantId,
            config_type: 'exec_impersonation',
            name: duplicateProfileName,
            value: 'chief executive officer',
            is_active: true,
          },
          {
            tenant_id: tenantId,
            config_type: 'domain_lookalike',
            name: importedProfileName,
            value: '0.87',
            is_active: true,
          },
        ],
        bounce_dsn_settings: [
          {
            tenant_id: tenantId,
            domain: unselectedBounceDomain,
            enabled: true,
            language: 'en',
            include_original_headers: true,
          },
        ],
      },
    };

    await selectTenantInBrowser(authenticatedPage, tenantId);
    await authenticatedPage.goto('/zh/rules/data', { waitUntil: 'networkidle' });

    await authenticatedPage.getByRole('button', { name: /导入\s*\/\s*导出|import\s*\/\s*export/i }).click();
    const dialog = importExportDialog(authenticatedPage);
    await expect(dialog).toBeVisible();

    await dialog.getByRole('tab', { name: /导入|Import/ }).click();
    await dialog.locator('input[type="file"]').setInputFiles({
      name: 'rule-import-export.json',
      mimeType: 'application/json',
      buffer: Buffer.from(JSON.stringify(importEnvelope, null, 2)),
    });

    await expect(dialog.getByText(/已加载：rule-import-export\.json|Loaded: rule-import-export\.json/)).toBeVisible();
    const importPanel = dialog.getByRole('tabpanel', { name: /导入|Import/ });
    await importPanel.getByRole('checkbox', { name: /规则|Rules/ }).click();
    await importPanel.getByRole('checkbox', { name: /退信 DSN 设置|Bounce DSN settings/ }).click();
    await dialog.getByRole('button', { name: /预览导入|Preview import/ }).click();

    await expect(dialog.getByText(/预览摘要|Preview summary/)).toBeVisible();
    await expect(dialog.getByText(/已解析 2，可导入 1，重复 1，无效 0|Parsed 2, importable 1, duplicates 1, invalid 0/)).toHaveCount(1);
    await expect(dialog.getByText(/已解析 0，可导入 0，重复 0，无效 0|Parsed 0, importable 0, duplicates 0, invalid 0/)).toHaveCount(2);
    await expect(dialog.getByText(/重复项处理|Duplicate handling/)).toBeVisible();

    await scrollDialog(authenticatedPage, dialog, 700);
    const showDetails = dialog.getByText(/查看详情|Show details/).first();
    await showDetails.scrollIntoViewIfNeeded();
    await showDetails.click();
    await expect(dialog.getByText(/源数据|Source payload/).first()).toBeVisible();
    await expect(dialog.getByText(duplicateProfileName).first()).toBeVisible();
    await expect(dialog.getByText(/现有项|Existing item/).first()).toBeVisible();

    await dialog.getByRole('checkbox', { name: /跳过其余所有重复项|Skip all remaining duplicates/ }).click();
    await scrollDialog(authenticatedPage, dialog, 700);
    const importButton = dialog.getByRole('button', { name: /^导入$|^Import$/ });
    await importButton.focus();
    await authenticatedPage.keyboard.press('Enter');

    await waitForToast(authenticatedPage);
    await expect(dialog).not.toBeVisible();

    const profilesResp = await apiGet(request, token, '/detection-profiles');
    expect(profilesResp.status()).toBe(200);
    const profilesBody = await profilesResp.json() as { items: Array<{ name: string; tenant_id?: number | null }> };
    expect(profilesBody.items.some((profile) => profile.name === importedProfileName && profile.tenant_id === tenantId)).toBe(true);
    expect(profilesBody.items.filter((profile) => profile.name === duplicateProfileName && profile.tenant_id === tenantId)).toHaveLength(1);

    const settingsResp = await exportSettings(request, token, tenantId);
    expect(settingsResp.status()).toBe(200);
    const exportedSettings = await settingsResp.json() as RuleExportEnvelope;

    const rulesResp = await apiGet(request, token, '/unified-rules?rule_class=action&stage=data');
    expect(rulesResp.status()).toBe(200);
    const rulesBody = await rulesResp.json() as { items: Array<{ name: string; tenant_id?: number | null }> };
    expect(rulesBody.items.some((rule) => rule.name === unselectedRuleName && rule.tenant_id === tenantId)).toBe(false);

    const bounceSettings = (exportedSettings.data.bounce_dsn_settings ?? []) as Array<{ domain: string; tenant_id: number }>;
    expect(bounceSettings.some((setting) => setting.domain === unselectedBounceDomain && setting.tenant_id === tenantId)).toBe(false);
  });
});
