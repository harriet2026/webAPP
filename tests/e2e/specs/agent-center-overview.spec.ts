import type { Page } from '@playwright/test';
import { test, expect } from '../fixtures/auth.fixture';

const BASE_URL = process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:3000';

const AGENT_OVERVIEW_RESPONSE = {
  agents: [
    {
      key: 'phishing',
      module_key: 'phishing_agent',
      feature_id: 'phishing-detection',
      access: 'enabled',
      status: 'running',
      stage_position: '4.0',
      policy_pages: [
        { page: 'phishing_admission', role: 'admission', management: 'dedicated' },
        { page: 'phishing_disposition', role: 'disposition', management: 'dedicated' },
      ],
      today_processed: 12,
      hit_count: 3,
      processed_count: 12,
      hit_rate: 0.25,
    },
    {
      key: 'spoofing',
      module_key: 'spoofing_agent',
      feature_id: 'spoofing-detection',
      access: 'enabled',
      status: 'running',
      stage_position: '4.1',
      policy_pages: [
        { page: 'spoofing_admission', role: 'admission', management: 'internal' },
        { page: 'spoofing_disposition', role: 'disposition', management: 'internal' },
      ],
      today_processed: 8,
      hit_count: 2,
      processed_count: 8,
      hit_rate: 0.25,
      fallback_count: 1,
    },
    {
      key: 'threat-retro',
      module_key: 'threat_retro_agent',
      feature_id: 'threat-retro',
      access: 'enabled',
      status: 'running',
      stage_position: '4.8',
      policy_pages: [
        { page: 'threat_retro_strategy', role: 'strategy', management: 'dedicated' },
      ],
      today_processed: 30,
      hit_count: 4,
      processed_count: 30,
      hit_rate: 0.1333,
    },
  ],
};

const FEATURE_REGISTRY = [
  {
    id: 'strategy-pipeline',
    visibility: 'ALWAYS',
    scope: 'mixed',
    platformAccess: 'edit',
    tenantAccess: 'edit',
    platformHidden: true,
    grantable: false,
    href: '/security/pipeline',
  },
  {
    id: 'phishing-detection',
    visibility: 'AI_ELSE_LOCK',
    scope: 'mixed',
    platformAccess: 'edit',
    tenantAccess: 'edit',
    platformHidden: true,
    grantable: true,
    href: '/agent-center/overview?agent=phishing',
  },
  {
    id: 'spoofing-detection',
    visibility: 'AI_ELSE_LOCK',
    scope: 'mixed',
    platformAccess: 'edit',
    tenantAccess: 'edit',
    platformHidden: true,
    grantable: true,
    href: '/agent-center/overview?agent=spoofing',
  },
  {
    id: 'threat-retro',
    visibility: 'AI_ELSE_LOCK',
    scope: 'mixed',
    platformAccess: 'edit',
    tenantAccess: 'edit',
    platformHidden: true,
    grantable: true,
    href: '/agent-center/overview?agent=threat-retro',
  },
];

const CAPABILITIES_BY_FORM: Record<string, { ai: boolean; multiTenant: boolean; saas: boolean }> = {
  cloud: { ai: true, multiTenant: true, saas: true },
  'ai-multi': { ai: true, multiTenant: true, saas: false },
  'ai-single': { ai: true, multiTenant: false, saas: false },
  'legacy-single': { ai: false, multiTenant: false, saas: false },
};

async function setProductForm(page: Page, form: string) {
  await page.context().addCookies([
    {
      name: 'osg_form_override',
      value: form,
      url: BASE_URL,
      sameSite: 'Lax',
    },
  ]);
}

async function setViewer(page: Page, viewer: 'platform' | 'tenant') {
  await page.context().addCookies([
    {
      name: 'osg_viewer',
      value: viewer,
      url: BASE_URL,
      sameSite: 'Strict',
    },
  ]);
}

async function mockBootstrap(page: Page, form: string, grants = ['phishing-detection', 'spoofing-detection', 'threat-retro']) {
  await page.route('**/api/v1/bootstrap**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        form,
        capabilities: CAPABILITIES_BY_FORM[form],
        branding: { deployment: form === 'cloud' ? 'saas' : 'self-hosted' },
        user: { role: 'system_admin', tenantId: null },
        featureRegistry: FEATURE_REGISTRY,
        grants,
      }),
    });
  });
}

async function mockAgentCenterOverview(page: Page) {
  await mockAgentCenterOverviewResponse(page, AGENT_OVERVIEW_RESPONSE);
}

async function mockAgentCenterOverviewResponse(page: Page, response: unknown) {
  await page.route('**/api/v1/agent-center/overview**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(response),
    });
  });
}

async function mockHiddenAgentCenterOverview(page: Page) {
  await page.route('**/api/v1/agent-center/overview**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        agents: AGENT_OVERVIEW_RESPONSE.agents.map((agent) => ({
          key: agent.key,
          feature_id: agent.feature_id,
          access: 'hidden',
          status: 'locked',
          stage_position: agent.stage_position,
          today_processed: null,
          hit_count: null,
          processed_count: null,
          hit_rate: null,
        })),
      }),
    });
  });
}

async function expectAiStage4(page: Page) {
  const stage4 = page.locator('[data-testid="pipeline-stage-stage4"]');

  await expect(stage4).toBeVisible();
  await expect(stage4).toHaveAttribute('data-stage-index', '4');
  await expect(stage4).toContainText('智能分析层');
  await expect(stage4.locator('[data-testid^="pipeline-policy-card-"]')).toHaveCount(3);
  await expect(stage4.locator('[data-testid="pipeline-policy-card-phishingAgent"]')).toBeVisible();
  await expect(stage4.locator('[data-testid="pipeline-policy-card-spoofingAgent"]')).toBeVisible();
  await expect(stage4.locator('[data-testid="pipeline-policy-card-threatRetroAgent"]')).toBeVisible();
  await expect(stage4.getByText('AI同步')).toHaveCount(2);
  await expect(stage4.getByText('AI异步')).toHaveCount(1);
  expect(
    await stage4.locator('[data-testid^="pipeline-policy-card-"]').evaluateAll((cards) => (
      cards.map((card) => card.getAttribute('data-testid'))
    )),
  ).toEqual([
    'pipeline-policy-card-phishingAgent',
    'pipeline-policy-card-spoofingAgent',
    'pipeline-policy-card-threatRetroAgent',
  ]);
}

async function loginWithProductForm(
  page: Page,
  form: string,
  options: { viewer?: 'platform' | 'tenant'; selectedTenantId?: number; grants?: string[] } = {},
) {
  await setProductForm(page, form);
  if (options.viewer) await setViewer(page, options.viewer);
  await mockBootstrap(page, form, options.grants);
  await page.goto('/zh/login?advance');
  await page.locator('input[name="username"]').fill('admin');
  await page.locator('input[name="password"]').fill('admin123');
  await page.locator('button[type="submit"]').click();
  await expect(page).toHaveURL(/dashboard/, { timeout: 15000 });
  if (options.selectedTenantId !== undefined) {
    await page.evaluate((tenantId) => {
      window.localStorage.setItem('osgateway_selected_tenant', String(tenantId));
      document.cookie = `osg_selected_tenant=${tenantId}; path=/; SameSite=Strict`;
    }, options.selectedTenantId);
    await page.reload();
    await expect(page).toHaveURL(/dashboard/, { timeout: 15000 });
  }
}

test.describe('Agent Center overview shell', () => {
  test('default overview renders three canonical cards', async ({ page }) => {
    await loginWithProductForm(page, 'ai-single');
    await mockAgentCenterOverview(page);

    await page.goto('/zh/agent-center/overview');

    await expect(page.locator('[data-testid="agent-center-card-phishing"]')).toBeVisible();
    await expect(page.locator('[data-testid="agent-center-card-spoofing"]')).toBeVisible();
    await expect(page.locator('[data-testid="agent-center-card-threat-retro"]')).toBeVisible();
    await expect(page.locator('[data-testid^="agent-center-card-"]')).toHaveCount(3);
    expect(
      await page.locator('[data-testid^="agent-center-card-"]').evaluateAll((cards) => (
        cards.map((card) => card.getAttribute('data-testid'))
      )),
    ).toEqual([
      'agent-center-card-phishing',
      'agent-center-card-spoofing',
      'agent-center-card-threat-retro',
    ]);

    await expect(page.getByText('钓鱼邮件检测智能体').first()).toBeVisible();
    await expect(page.getByText('仿冒邮件检测智能体').first()).toBeVisible();
    await expect(page.getByText('威胁回溯智能体').first()).toBeVisible();

    for (const key of ['phishing', 'spoofing', 'threat-retro']) {
      const card = page.locator(`[data-testid="agent-center-card-${key}"]`);
      await expect(card).toContainText('检出率');
      await expect(card).not.toContainText('命中率');
      await expect(card.locator('a')).toHaveCount(1);
      await expect(card.locator('a')).toContainText('配置');
      await expect(card.locator('button[title="日志"], button[title="统计"]')).toHaveCount(0);
      await expect(card.locator('[role="switch"]')).toHaveCount(0);
    }
    await expect(page.locator('[data-testid="agent-center-overview"] [role="switch"]')).toHaveCount(0);

    await page.locator('[data-testid="agent-center-hit-rate-help-phishing"]').hover();
    await expect(page.getByText(/不是准确率、召回率、全局漏判率或服务健康指标/)).toBeVisible();
  });

  test('sidebar navigation opens the default overview', async ({ page }) => {
    await loginWithProductForm(page, 'ai-single');
    await mockAgentCenterOverview(page);

    await page.goto('/zh/security/pipeline');
    await page.getByRole('button', { name: /智能体中心/ }).click();
    await page.getByRole('button', { name: /智能体总览/ }).click();

    await expect(page).toHaveURL(/\/zh\/agent-center\/overview$/);
    await expect(page.locator('[data-testid^="agent-center-card-"]')).toHaveCount(3);
  });

  test('unknown query values fall back to overview', async ({ page }) => {
    await loginWithProductForm(page, 'ai-single');
    await mockAgentCenterOverview(page);

    for (const path of [
      '/zh/agent-center/overview?agent=unknown',
      '/zh/agent-center/overview?tab=config',
    ]) {
      await page.goto(path);

      await expect(page.locator('[data-testid^="agent-center-card-"]')).toHaveCount(3);
      await expect(page.locator('[data-testid="agent-center-detail"]')).toHaveCount(0);
    }
  });

  test('overview card configure actions use canonical deep links', async ({ page }) => {
    await loginWithProductForm(page, 'ai-single');
    await mockAgentCenterOverview(page);
    const genericRuleWrites: string[] = [];
    page.on('request', (request) => {
      const pathname = new URL(request.url()).pathname;
      if (pathname.includes('/api/v1/unified-rules') && request.method() !== 'GET') {
        genericRuleWrites.push(`${request.method()} ${pathname}`);
      }
    });

    const cases = [
      {
        card: 'phishing',
        url: /\/zh\/agent-center\/overview\?agent=phishing&tab=config/,
        title: '钓鱼邮件检测智能体',
        dedicatedApi: /\/api\/v1\/phishing-agent\/admission-rules$/,
      },
      {
        card: 'spoofing',
        url: /\/zh\/agent-center\/overview\?agent=spoofing&tab=sender-name/,
        title: '仿冒邮件检测智能体',
        dedicatedApi: /\/api\/v1\/spoofing-agent\/persons$/,
      },
      {
        card: 'threat-retro',
        url: /\/zh\/agent-center\/overview\?agent=threat-retro&tab=strategy/,
        title: '威胁回溯智能体',
        dedicatedApi: /\/api\/v1\/threat-retro-agent\/strategies$/,
      },
    ];

    for (const item of cases) {
      await page.goto('/zh/agent-center/overview');
      await expect(page.locator(`[data-testid="agent-center-card-${item.card}"]`)).toBeVisible();
      const dedicatedRequest = page.waitForRequest((request) => (
        request.method() === 'GET'
        && item.dedicatedApi.test(new URL(request.url()).pathname)
      ));
      await page
        .locator(`[data-testid="agent-center-card-${item.card}"]`)
        .locator('a')
        .click();

      await expect(page).toHaveURL(item.url);
      await dedicatedRequest;
      await expect(page.getByRole('heading', { name: item.title }).first()).toBeVisible();
      await expect(page.locator('[data-testid="agent-center-summary-overview"]')).toBeVisible();
      await expect(page.locator(`[data-testid="agent-center-summary-${item.card}"]`)).toBeVisible();
    }
    expect(genericRuleWrites).toEqual([]);
  });

  test('invalid management metadata keeps status cards but removes configuration actions', async ({ page }) => {
    await loginWithProductForm(page, 'ai-single');
    await mockAgentCenterOverviewResponse(page, {
      agents: [
        {
          ...AGENT_OVERVIEW_RESPONSE.agents[0],
          policy_pages: [
            { page: 'phishing_admission', role: 'admission', management: 'dedicated' },
          ],
        },
        {
          ...AGENT_OVERVIEW_RESPONSE.agents[1],
          policy_pages: [
            { page: 'spoofing_admission', role: 'admission', management: 'mystery' },
            { page: 'spoofing_disposition', role: 'disposition', management: 'internal' },
          ],
        },
        {
          ...AGENT_OVERVIEW_RESPONSE.agents[2],
          module_key: 'future_agent',
        },
      ],
    });

    await page.goto('/zh/agent-center/overview');

    await expect(page.locator('[data-testid^="agent-center-card-"]')).toHaveCount(3);
    for (const key of ['phishing', 'spoofing', 'threat-retro']) {
      const card = page.locator(`[data-testid="agent-center-card-${key}"]`);
      await expect(card).toBeVisible();
      await expect(card.locator('a')).toHaveCount(0);
    }

    const detailCases = [
      {
        path: '/zh/agent-center/overview?agent=phishing&tab=config',
        panel: 'agent-center-phishing-panel',
        hiddenTabs: ['phishing-config-tab'],
      },
      {
        path: '/zh/agent-center/overview?agent=spoofing&tab=protected-objects',
        panel: 'agent-center-spoofing-panel',
        hiddenTabs: ['spoofing-protected-objects-tab', 'spoofing-brand-tab'],
      },
      {
        path: '/zh/agent-center/overview?agent=threat-retro&tab=strategy',
        panel: 'agent-center-threat-retro-panel',
        hiddenTabs: ['threat-retro-strategy-tab'],
      },
    ];

    for (const item of detailCases) {
      await page.goto(item.path);
      await expect(page.locator(`[data-testid="${item.panel}"]`)).toBeVisible();
      for (const testID of item.hiddenTabs) {
        await expect(page.locator(`[data-testid="${testID}"]`)).toHaveCount(0);
      }
    }
  });

  test('spoofing protected-objects deep link opens the protected identities tab', async ({ page }) => {
    await loginWithProductForm(page, 'ai-single');
    await mockAgentCenterOverview(page);

    await page.goto('/zh/agent-center/overview?agent=spoofing&tab=protected-objects');

    await expect(page).toHaveURL(/\/zh\/agent-center\/overview\?agent=spoofing&tab=protected-objects/);
    await expect(page.getByRole('heading', { name: '仿冒邮件检测智能体' }).first()).toBeVisible();
    // Assert selection via ARIA, not Radix's data-state: the Tabs primitive is
    // Base UI (@base-ui/react/tabs), which exposes selection as aria-selected and
    // never emits data-state. aria-selected is primitive-agnostic, so this keeps
    // working if the underlying library is swapped again.
    await expect(page.getByRole('tab', { name: '发信人名称仿冒' })).toHaveAttribute('aria-selected', 'true');
    // The card title is a shadcn <CardTitle>, which renders a <div> by design —
    // it is not a heading, so scope to the ACTIVE tabpanel and assert its title
    // text instead. Still discriminating: the wrong tab would not carry it.
    await expect(
      page.getByRole('tabpanel', { name: '发信人名称仿冒' }).getByText('保护对象').first(),
    ).toBeVisible();
  });

  test('non-AI form redirects direct /agent-center/overview access to dashboard', async ({ page }) => {
    await loginWithProductForm(page, 'legacy-single');

    await page.goto('/zh/agent-center/overview');

    await expect(page).toHaveURL(/\/zh\/dashboard/);
  });

  test('non-AI form redirects agent-center deep links to dashboard', async ({ page }) => {
    await loginWithProductForm(page, 'legacy-single');

    await page.goto('/zh/agent-center/overview?agent=phishing');

    await expect(page).toHaveURL(/\/zh\/dashboard/);
  });

  test('hidden direct deep link falls back to overview without locked detail', async ({ page }) => {
    await loginWithProductForm(page, 'ai-multi');
    await mockHiddenAgentCenterOverview(page);

    await page.goto('/zh/agent-center/overview?agent=phishing');

    await expect(page.getByRole('heading', { name: '智能体总览' }).first()).toBeVisible();
    await expect(page.locator('[data-testid="agent-center-detail"]')).toHaveCount(0);
    await expect(page.locator('[data-testid="agent-center-phishing-locked"]')).toHaveCount(0);
    await expect(page.locator('[data-testid^="agent-center-card-"]')).toHaveCount(0);
  });

  test('legacy standalone agent routes are absent and do not redirect to agent center', async ({ page }) => {
    await loginWithProductForm(page, 'ai-single');

    for (const path of ['/zh/phishing-detection', '/zh/spoofing-detection', '/zh/threat-retro']) {
      const response = await page.goto(path);

      expect(response?.status()).toBe(404);
      await expect(page).not.toHaveURL(/\/agent-center\/overview/);
    }
  });
});

test.describe('Agent Center pipeline integration', () => {
  test('AI Stage 4 cards and config actions navigate to agent-center deep links', async ({ page }) => {
    await loginWithProductForm(page, 'ai-single');
    await mockAgentCenterOverview(page);

    const cases = [
      {
        card: 'phishingAgent',
        url: /\/zh\/agent-center\/overview\?agent=phishing&tab=config/,
      },
      {
        card: 'spoofingAgent',
        url: /\/zh\/agent-center\/overview\?agent=spoofing&tab=sender-name/,
      },
      {
        card: 'threatRetroAgent',
        url: /\/zh\/agent-center\/overview\?agent=threat-retro&tab=strategy/,
      },
    ];

    for (const item of cases) {
      for (const selector of [
        `[data-testid="pipeline-policy-card-${item.card}"]`,
        `[data-testid="pipeline-policy-config-${item.card}"]`,
      ]) {
        await page.goto('/zh/security/pipeline');
        await expectAiStage4(page);

        await page.locator(selector).click();

        await expect(page).toHaveURL(item.url);
      }
    }
  });

  test('invalid management metadata keeps pipeline cards fail-closed', async ({ page }) => {
    await loginWithProductForm(page, 'ai-single');
    await mockAgentCenterOverviewResponse(page, {
      agents: [
        {
          ...AGENT_OVERVIEW_RESPONSE.agents[0],
          policy_pages: [
            { page: 'phishing_admission', role: 'admission', management: 'dedicated' },
          ],
        },
        {
          ...AGENT_OVERVIEW_RESPONSE.agents[1],
          policy_pages: [
            { page: 'spoofing_admission', role: 'admission', management: 'mystery' },
            { page: 'spoofing_disposition', role: 'disposition', management: 'internal' },
          ],
        },
        {
          ...AGENT_OVERVIEW_RESPONSE.agents[2],
          module_key: 'future_agent',
        },
      ],
    });

    await page.goto('/zh/security/pipeline');
    await expectAiStage4(page);

    for (const key of ['phishingAgent', 'spoofingAgent', 'threatRetroAgent']) {
      await expect(page.locator(`[data-testid="pipeline-policy-config-${key}"]`)).toBeDisabled();
    }
  });

  test('locked agents stay visible and hidden agents stay absent in the pipeline', async ({ page }) => {
    await loginWithProductForm(page, 'ai-single');
    await mockAgentCenterOverviewResponse(page, {
      agents: [
        {
          ...AGENT_OVERVIEW_RESPONSE.agents[0],
          access: 'locked',
          status: 'locked',
        },
        {
          ...AGENT_OVERVIEW_RESPONSE.agents[1],
          access: 'hidden',
          status: 'locked',
        },
        AGENT_OVERVIEW_RESPONSE.agents[2],
      ],
    });

    await page.goto('/zh/security/pipeline');

    const stage4 = page.locator('[data-testid="pipeline-stage-stage4"]');
    await expect(stage4).toBeVisible();
    await expect(stage4.locator('[data-testid^="pipeline-policy-card-"]')).toHaveCount(2);
    await expect(page.locator('[data-testid="pipeline-policy-card-phishingAgent"]')).toBeVisible();
    await expect(page.locator('[data-testid="pipeline-policy-config-phishingAgent"]')).toBeDisabled();
    await expect(page.locator('[data-testid="pipeline-policy-card-spoofingAgent"]')).toHaveCount(0);
    await expect(page.locator('[data-testid="pipeline-policy-config-threatRetroAgent"]')).toBeEnabled();

    await page.locator('[data-testid="pipeline-policy-card-phishingAgent"]').click();
    await expect(page).toHaveURL(/\/zh\/security\/pipeline$/);
  });

  test('Agent Center and pipeline reuse one overview query cache', async ({ page }) => {
    await loginWithProductForm(page, 'ai-single');
    let overviewRequests = 0;
    await page.route('**/api/v1/agent-center/overview**', async (route) => {
      overviewRequests += 1;
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(AGENT_OVERVIEW_RESPONSE),
      });
    });

    await page.goto('/zh/security/pipeline');
    await expectAiStage4(page);
    await page.getByRole('button', { name: /智能体中心/ }).click();
    await page.getByRole('button', { name: /智能体总览/ }).click();
    await expect(page.locator('[data-testid^="agent-center-card-"]')).toHaveCount(3);

    expect(overviewRequests).toBe(1);
  });

  // SKIP (GT-12149 / PRD §1.4): navigates the pipeline in a multi-tenant form
  // while logged in as the platform admin (system_admin JWT), which is now blocked
  // from Module A. The platform-view case is invalid by design; the tenant-view cases
  // need a tenant_admin JWT that this spec's admin-login mock framework does not mint.
  test.skip('multi-tenant platform view hides resolver platformHidden AI Stage 4 cards', async ({ page }) => {
    await loginWithProductForm(page, 'ai-multi');

    await page.goto('/zh/security/pipeline');

    await expect(page.locator('[data-testid="pipeline-stage-stage4"]')).toHaveCount(0);
    await expect(page.locator('[data-testid="pipeline-policy-card-phishingAgent"]')).toHaveCount(0);
    await expect(page.locator('[data-testid="pipeline-policy-card-spoofingAgent"]')).toHaveCount(0);
    await expect(page.locator('[data-testid="pipeline-policy-card-threatRetroAgent"]')).toHaveCount(0);

    const comprehensiveStage = page.locator('[data-testid="pipeline-stage-stage5"]');
    await expect(comprehensiveStage).toBeVisible();
    await expect(comprehensiveStage).toHaveAttribute('data-stage-index', '4');
  });

  // SKIP (GT-12149 / PRD §1.4): navigates the pipeline in a multi-tenant form
  // while logged in as the platform admin (system_admin JWT), which is now blocked
  // from Module A. The platform-view case is invalid by design; the tenant-view cases
  // need a tenant_admin JWT that this spec's admin-login mock framework does not mint.
  test.skip('locked tenant AI Stage 4 cards are visible but cannot navigate', async ({ page }) => {
    await loginWithProductForm(page, 'cloud', { viewer: 'tenant', selectedTenantId: 7, grants: [] });

    await page.goto('/zh/security/pipeline');
    await expectAiStage4(page);

    const phishingCard = page.locator('[data-testid="pipeline-policy-card-phishingAgent"]');
    await phishingCard.click();
    await expect(page).toHaveURL(/\/zh\/security\/pipeline$/);
    await expect(page.locator('[data-testid="pipeline-policy-config-phishingAgent"]')).toBeDisabled();
  });

  // SKIP (GT-12149 / PRD §1.4): navigates the pipeline in a multi-tenant form
  // while logged in as the platform admin (system_admin JWT), which is now blocked
  // from Module A. The platform-view case is invalid by design; the tenant-view cases
  // need a tenant_admin JWT that this spec's admin-login mock framework does not mint.
  test.skip('granted tenant AI Stage 4 cards expose editable configuration actions', async ({ page }) => {
    await loginWithProductForm(page, 'cloud', {
      viewer: 'tenant',
      selectedTenantId: 7,
      grants: ['phishing-detection', 'spoofing-detection', 'threat-retro'],
    });
    await mockAgentCenterOverview(page);

    await page.goto('/zh/security/pipeline');
    await expectAiStage4(page);

    const spoofingConfig = page.locator('[data-testid="pipeline-policy-config-spoofingAgent"]');
    await expect(spoofingConfig).toBeEnabled();
    await spoofingConfig.click();
    await expect(page).toHaveURL(/\/zh\/agent-center\/overview\?agent=spoofing&tab=sender-name/);
  });

  test('traditional form pipeline hides AI layer and shows comprehensive strategy as Stage 4', async ({ page }) => {
    await loginWithProductForm(page, 'legacy-single');
    await mockHiddenAgentCenterOverview(page);

    await page.goto('/zh/security/pipeline');

    await expect(page.locator('[data-testid="pipeline-stage-stage4"]')).toHaveCount(0);
    await expect(page.locator('[data-testid="pipeline-policy-card-phishingAgent"]')).toHaveCount(0);
    await expect(page.locator('[data-testid="pipeline-policy-card-spoofingAgent"]')).toHaveCount(0);
    await expect(page.locator('[data-testid="pipeline-policy-card-threatRetroAgent"]')).toHaveCount(0);
    await expect(page.getByText('智能分析层')).toHaveCount(0);

    const comprehensiveStage = page.locator('[data-testid="pipeline-stage-stage5"]');
    await expect(comprehensiveStage).toBeVisible();
    await expect(comprehensiveStage).toHaveAttribute('data-stage-index', '4');
    await expect(comprehensiveStage.getByText('综合策略')).toBeVisible();
    await expect(comprehensiveStage.locator('[data-testid^="pipeline-policy-card-"]')).toHaveCount(3);
    await expect(comprehensiveStage.locator('[data-testid="pipeline-policy-card-similarDetection"]')).toBeVisible();
    await expect(comprehensiveStage.locator('[data-testid="pipeline-policy-card-advancedRules"]')).toBeVisible();
    await expect(comprehensiveStage.locator('[data-testid="pipeline-policy-card-mailMarking"]')).toBeVisible();
    await expect(comprehensiveStage.getByText(/AI同步|AI异步/)).toHaveCount(0);
  });
});
