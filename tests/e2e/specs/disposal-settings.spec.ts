import { test, expect } from '../fixtures/auth.fixture';
import { getDefaultTenantId, pickActiveTenantId } from '../helpers/tenant';
import { ensureFiltersExpanded } from '../helpers/mail-list';

test.describe('处置设置', () => {
  // The tenant the page is scoped to. Resolved via getDefaultTenantId (page_size
  // 500, lowest id) — the same tenant global-setup activates. Do NOT re-derive it
  // from an unpaginated /tenants call: the list is not id-ordered, so on a dev DB
  // littered with leftover tenants the first page can yield a `pending` one,
  // which TenantSelector then clears.
  let tenantId: number;

  test.beforeEach(async ({ authenticatedPage, request }) => {
    tenantId = await getDefaultTenantId(request);

    // GT-12245: the PLATFORM viewer now actively clears a residual tenant
    // selection (product-form-context.tsx: a system_admin's platform view must
    // never retain an impersonated tenant, or a stale X-Tenant-ID gets sent and
    // the API rejects the write). So writing osgateway_selected_tenant alone is
    // not enough -- the selection is wiped on mount, the page renders
    // 「请先选择租户以管理其处置设置」 and every tab/combobox lookup below times
    // out. Switch the viewer to `tenant` as the real switcher does.
    await authenticatedPage.evaluate((tid) => {
      localStorage.setItem('osgateway_selected_tenant', String(tid));
      document.cookie = `osg_selected_tenant=${tid}; path=/; SameSite=Strict`;
      document.cookie = 'osg_viewer=tenant; path=/; SameSite=Strict';
    }, tenantId);
    // Writing osg_viewer makes the product-form context navigate once on its
    // own; goto-ing straight away truncates it into net::ERR_ABORTED.
    await authenticatedPage.waitForLoadState('domcontentloaded');
    await authenticatedPage.waitForTimeout(500);

    await authenticatedPage.goto('/zh/email-disposal/disposal-settings');
    await expect(
      authenticatedPage.getByRole('heading', { name: '处置设置' }),
    ).toBeVisible();
  });

  // GT-12021: Base UI's <Select.Value> renders the raw value unless the Root is
  // given an `items` map, so the trigger showed the tenant id ("1") rather than
  // the tenant's name. Assert on the rendered text, not on any class/attribute.
  //
  // Asserted on the disposal CENTER page, not this settings page. The settings
  // page only renders TenantSelector in the PLATFORM viewer
  // (showTenant = multiTenant && effectiveViewer === 'platform'), and since
  // GT-12245 the platform viewer actively clears any tenant selection -- so its
  // trigger can only ever read 「所有租户」 and could never show a name. The
  // center page uses the PAGE-SCOPED form (value/onChange), where a selection
  // sticks and the trigger renders the tenant's name, which is exactly the
  // rendering GT-12021 regressed.
  test('租户选择器显示租户名称而非租户 ID (GT-12021)', async ({ authenticatedPage, request }) => {
    const loginResp = await request.post('http://localhost:18080/api/v1/auth/login', {
      data: { username: 'admin', password: 'admin123' },
    });
    const { token } = (await loginResp.json()) as { token: string };
    const tenantResp = await request.get(`http://localhost:18080/api/v1/tenants/${tenantId}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const tenant = (await tenantResp.json()) as { id: number; name: string };
    expect(tenant.name, 'default tenant must have a name').toBeTruthy();

    // Platform viewer: that is where the page-scoped selector is offered.
    await authenticatedPage.evaluate(() => {
      document.cookie = 'osg_viewer=platform; path=/; SameSite=Strict';
    });
    // Switching the viewer makes the product-form context navigate on its own;
    // goto-ing straight away truncates that into net::ERR_ABORTED.
    await authenticatedPage.waitForLoadState('domcontentloaded');
    await authenticatedPage.waitForTimeout(500);
    await authenticatedPage.goto('/zh/email-disposal/center');

    // 09ee6b4cdd (搜索栏对齐): the structured filters — tenant selector
    // included — sit behind the 高级筛选 toggle and start collapsed.
    await ensureFiltersExpanded(authenticatedPage);

    const trigger = authenticatedPage.getByTestId('tenant-selector');
    await expect(trigger).toBeVisible();

    // Pick the tenant, then assert the trigger renders its NAME, not the id.
    await trigger.click();
    await authenticatedPage.getByRole('option', { name: tenant.name }).click();
    await expect(trigger).toContainText(tenant.name);
    const shown = ((await trigger.textContent()) ?? '').replace(/[▼\s]/g, '');
    expect(shown).not.toBe(String(tenantId));
  });

  test('三个 Tab 可正常切换', async ({ authenticatedPage }) => {
    const quarantineTab = authenticatedPage.getByRole('tab', {
      name: '隔离区设置',
    });
    const reviewTab = authenticatedPage.getByRole('tab', {
      name: '审核设置',
    });
    const recallTab = authenticatedPage.getByRole('tab', {
      name: '召回策略设置',
    });

    await expect(quarantineTab).toBeVisible();
    await expect(reviewTab).toBeVisible();
    await expect(recallTab).toBeVisible();

    await reviewTab.click();
    await expect(
      authenticatedPage.getByText('审核时长与超时配置'),
    ).toBeVisible();

    await recallTab.click();
    await expect(
      authenticatedPage.getByText('召回引擎待上线'),
    ).toBeVisible();

    await quarantineTab.click();
    await expect(
      authenticatedPage.getByRole('heading', { name: '通知设置', exact: true }),
    ).toBeVisible();
  });

  test('保存设置成功后显示提示', async ({ authenticatedPage }) => {
    // GT-12077: 取回/预览权限默认开启，此时 portal_base_url 是必填的（否则摘要信里
    // 的链接无从生成）。租户初始为空，所以保存前必须先填外部访问地址，否则后端 400。
    await authenticatedPage
      .locator('#portal-base-url')
      .fill('https://gw.example.com');

    await authenticatedPage
      .getByRole('button', { name: '保存设置' })
      .click();
    await expect(
      authenticatedPage.getByText('设置已保存'),
    ).toBeVisible();
  });

  test('取回/预览开启时未填外部访问地址则保存被拒并就地报错', async ({
    authenticatedPage,
    request,
  }) => {
    // 先把前置条件做实：用例名要求「取回/预览开启」，但此前它直接依赖环境里的
    // 既有值。后端只有在 recall/preview 至少一个开启时才对空地址报 400，所以一旦
    // 有人（例如 Python E2E 的 test_permissions_all_disabled）把权限全关掉，这里
    // 保存会正常成功、aria-invalid 保持 false，用例就以「产品没报错」的假象失败，
    // 真因却在另一个套件里。自己建立前置条件即可与外部状态解耦。
    const loginResp = await request.post('http://localhost:18080/api/v1/auth/login', {
      data: { username: 'admin', password: 'admin123' },
    });
    const { token } = (await loginResp.json()) as { token: string };
    const headers = { Authorization: `Bearer ${token}`, 'X-Tenant-ID': String(tenantId) };

    const curResp = await request.get('http://localhost:18080/api/v1/disposal-settings', { headers });
    expect(curResp.status(), 'GET disposal-settings').toBe(200);
    const settings = (await curResp.json()) as Record<string, any>;
    settings.quarantine.permissions.recall.enabled = true;
    settings.quarantine.permissions.preview.enabled = true;
    settings.quarantine.portal_base_url = 'https://gw.example.com';
    const seedResp = await request.put('http://localhost:18080/api/v1/disposal-settings', {
      headers,
      data: settings,
    });
    expect(seedResp.status(), `seed recall/preview enabled: ${await seedResp.text()}`).toBe(200);

    await authenticatedPage.reload();
    await expect(
      authenticatedPage.getByRole('heading', { name: '处置设置' }),
    ).toBeVisible();

    // 反向用例：把地址清空再保存，必须被后端拒绝，且错误落在该字段上（而不是
    // 静默失败）—— 这正是 GT-12077 里链接不可用的根因所在。
    await authenticatedPage.locator('#portal-base-url').fill('');

    await authenticatedPage
      .getByRole('button', { name: '保存设置' })
      .click();

    await expect(
      authenticatedPage.locator('#portal-base-url'),
    ).toHaveAttribute('aria-invalid', 'true');
  });

  test('重置恢复默认值', async ({ authenticatedPage }) => {
    await authenticatedPage
      .getByRole('tab', { name: '审核设置' })
      .click();

    const minutesInput = authenticatedPage.locator(
      'input[type="number"]',
    ).first();
    await minutesInput.fill('120');

    await authenticatedPage
      .getByRole('button', { name: '重置' })
      .click();

    await expect(minutesInput).toHaveValue('15');
  });

  test('审核设置 - 不限时长和自定义切换', async ({
    authenticatedPage,
  }) => {
    await authenticatedPage
      .getByRole('tab', { name: '审核设置' })
      .click();

    await expect(
      authenticatedPage.getByText('不限时长'),
    ).toBeVisible();
    await expect(
      authenticatedPage.getByText('自定义等待时长'),
    ).toBeVisible();
    await expect(
      authenticatedPage.getByText('超时自动投递'),
    ).toBeVisible();

    const autoDeliverSwitch = authenticatedPage.locator(
      '[data-slot="switch"]',
    ).first();
    const wasChecked = await autoDeliverSwitch.getAttribute('data-checked');
    await autoDeliverSwitch.click();
    if (wasChecked !== null) {
      await expect(autoDeliverSwitch).toHaveAttribute('data-unchecked', '');
    } else {
      await expect(autoDeliverSwitch).toHaveAttribute('data-checked', '');
    }
  });

  test('隔离区分类通知为 9 类邮件类型且开关联动阈值输入', async ({ authenticatedPage }) => {
    // 9 类行齐全（按 demo 展示顺序），行定位一律走稳定 testid，不再用文案/nth。
    const categories = [
      'spam', 'advertising', 'suspicious', 'sensitive', 'phishing',
      'virus', 'account_compromised', 'spoofing', 'harmful',
    ];
    for (const key of categories) {
      await expect(
        authenticatedPage.getByTestId(`disposal-settings-category-row-${key}`),
      ).toBeVisible();
    }
    // 确定性判定提示条常驻。
    await expect(
      authenticatedPage.getByTestId('disposal-settings-score-hint'),
    ).toBeVisible();

    // 勾选联动：勾选行有 min/max 阈值输入，取消勾选后输入移除。
    const spamCheckbox = authenticatedPage.getByTestId('disposal-settings-category-checkbox-spam');
    const spamMin = authenticatedPage.getByTestId('disposal-settings-category-min-spam');
    const wasChecked = await spamCheckbox.isChecked();
    if (wasChecked) {
      await expect(spamMin).toBeVisible();
      await spamCheckbox.click();
      await expect(spamMin).not.toBeVisible();
    } else {
      await expect(spamMin).not.toBeVisible();
      await spamCheckbox.click();
      await expect(spamMin).toBeVisible();
    }
    // 还原，避免污染后续用例的表单态（本用例不保存，仅还原 UI）。
    await spamCheckbox.click();
  });

  test('通知范围选择器渲染（组/部门列表或空态引导）', async ({ authenticatedPage }) => {
    const scope = authenticatedPage.getByTestId('disposal-settings-scope');
    await scope.scrollIntoViewIfNeeded();
    await expect(scope).toBeVisible();
    // 真实后端下收信人组/组织通讯录可能为空：有数据显示行，无数据必须显示
    // 引导空态，二者必居其一（dispatcher fallback 空壳不在真实后端出现）。
    const groupRows = scope.locator('[data-testid^=disposal-settings-scope-group-row-]');
    const groupEmpty = authenticatedPage.getByTestId('disposal-settings-scope-group-empty');
    expect((await groupRows.count()) > 0 || (await groupEmpty.count()) === 1).toBe(true);
    const deptNodes = scope.locator('[data-testid^=disposal-settings-scope-dept-node-]');
    const deptEmpty = authenticatedPage.getByTestId('disposal-settings-scope-dept-empty');
    expect((await deptNodes.count()) > 0 || (await deptEmpty.count()) === 1).toBe(true);
  });

  test('审核 Tab 旁路超时字段可见（复检窗口+超时临时处置）', async ({ authenticatedPage }) => {
    await authenticatedPage.getByTestId('disposal-settings-tab-review').click();

    const maxRecheck = authenticatedPage.getByTestId('disposal-settings-max-recheck-minutes');
    await expect(maxRecheck).toBeVisible();
    await expect(maxRecheck).toHaveValue(/^\d+$/);

    await expect(
      authenticatedPage.getByTestId('disposal-settings-timeout-disposal-deliver'),
    ).toBeVisible();
    const markRadio = authenticatedPage.getByTestId('disposal-settings-timeout-disposal-mark');
    await expect(markRadio).toBeVisible();
    // 选择「添加标记后投递」→ 标记位置/标记文本出现。
    await markRadio.scrollIntoViewIfNeeded();
    await markRadio.click();
    await expect(
      authenticatedPage.getByTestId('disposal-settings-timeout-mark-positions'),
    ).toBeVisible();
    await expect(
      authenticatedPage.getByTestId('disposal-settings-timeout-mark-text'),
    ).toBeVisible();
    // 还原为直接投递，避免污染后续保存类用例。
    await authenticatedPage.getByTestId('disposal-settings-timeout-disposal-deliver').click();
  });

  test('用户权限开关可切换且影响有效天数输入框', async ({
    authenticatedPage,
  }) => {
    await expect(
      authenticatedPage.getByText('用户权限设置'),
    ).toBeVisible();

    const firstSwitch = authenticatedPage.locator(
      '[data-slot="switch"]',
    ).first();
    await expect(firstSwitch).toBeVisible();

    const firstPermInput = authenticatedPage
      .locator('table input[type="number"]')
      .first();
    const wasEnabled = await firstPermInput.isEnabled();
    expect(wasEnabled).toBe(await firstSwitch.getAttribute('data-checked') !== null);

    await firstSwitch.click();
    if (wasEnabled) {
      await expect(firstPermInput).toBeDisabled();
    } else {
      await expect(firstPermInput).toBeEnabled();
    }
  });

  test('召回策略 Tab 显示单选矩阵且默认值正确', async ({ authenticatedPage }) => {
    await authenticatedPage.getByTestId('disposal-settings-tab-recall').click();

    await expect(
      authenticatedPage.getByText('威胁情报触发'),
    ).toBeVisible();
    await expect(
      authenticatedPage.getByText('AI 检测触发'),
    ).toBeVisible();
    await expect(
      authenticatedPage.getByText('已读邮件处理策略').first(),
    ).toBeVisible();
    await expect(
      authenticatedPage.getByText('未读邮件处理策略').first(),
    ).toBeVisible();

    // 单选矩阵选中态必须与后端持久化值一致（dev DB 是长寿命的，可能已保存过
    // 非默认值，所以以 API 返回为基准断言而非硬编码默认值；后端默认为
    // 威胁情报 recall/recall、AI 检测 notify/recall）。
    // base-ui Radio 的选中态是 data-checked 属性（不是 aria-checked）。
    const loginResp = await authenticatedPage.request.post(
      'http://localhost:18080/api/v1/auth/login',
      { data: { username: 'admin', password: 'admin123' } },
    );
    const { token } = (await loginResp.json()) as { token: string };
    const settingsResp = await authenticatedPage.request.get(
      'http://localhost:18080/api/v1/disposal-settings',
      { headers: { Authorization: `Bearer ${token}`, 'X-Tenant-ID': String(tenantId) } },
    );
    const settings = (await settingsResp.json()) as {
      recall: {
        threat_intel: { read_policy: string; unread_policy: string };
        ai_detection: { read_policy: string; unread_policy: string };
      };
    };
    for (const section of ['threat_intel', 'ai_detection'] as const) {
      for (const [rw, field] of [['read', 'read_policy'], ['unread', 'unread_policy']] as const) {
        const value = settings.recall[section][field];
        await expect(
          authenticatedPage.getByTestId(`disposal-settings-policy-${section}-${rw}-${value}`),
        ).toHaveAttribute('data-checked', '');
      }
    }
  });

  test('API 获取与前端显示一致', async ({
    authenticatedPage,
    request,
  }) => {
    const loginResp = await request.post(
      'http://localhost:18080/api/v1/auth/login',
      { data: { username: 'admin', password: 'admin123' } },
    );
    expect(loginResp.status()).toBe(200);
    const { token } = (await loginResp.json()) as { token: string };

    const tenantsResp = await request.get(
      'http://localhost:18080/api/v1/tenants',
      { headers: { Authorization: `Bearer ${token}` } },
    );
    expect(tenantsResp.status()).toBe(200);
    const tenantsBody = (await tenantsResp.json()) as { items: { id: number }[] };
    const tenantId = pickActiveTenantId(tenantsBody.items);

    const resp = await request.get(
      'http://localhost:18080/api/v1/disposal-settings',
      { headers: { Authorization: `Bearer ${token}`, 'X-Tenant-ID': String(tenantId) } },
    );
    expect(resp.status()).toBe(200);
    const body = await resp.json();

    expect(body).toHaveProperty('quarantine');
    expect(body).toHaveProperty('review');
    expect(body).toHaveProperty('recall');
    expect(body.quarantine).toHaveProperty('notify_frequency');
    expect(body.review).toHaveProperty('duration_mode');
    expect(body.recall).toHaveProperty('notify_frequency');
  });

  test('API 保存设置往返', async ({ request }) => {
    const loginResp = await request.post(
      'http://localhost:18080/api/v1/auth/login',
      { data: { username: 'admin', password: 'admin123' } },
    );
    expect(loginResp.status()).toBe(200);
    const { token } = (await loginResp.json()) as { token: string };

    const tenantsResp = await request.get(
      'http://localhost:18080/api/v1/tenants',
      { headers: { Authorization: `Bearer ${token}` } },
    );
    expect(tenantsResp.status()).toBe(200);
    const tenantsBody = (await tenantsResp.json()) as { items: { id: number }[] };
    const tenantId = pickActiveTenantId(tenantsBody.items);
    const authHeaders = {
      Authorization: `Bearer ${token}`,
      'X-Tenant-ID': String(tenantId),
    };

    const getResp = await request.get(
      'http://localhost:18080/api/v1/disposal-settings',
      { headers: authHeaders },
    );
    const original = await getResp.json();

    const modified = {
      ...original,
      quarantine: {
        ...original.quarantine,
        notify_frequency: 'custom',
        custom_weekdays: [1, 2, 3, 4, 5],
        notify_times: ['09:00', '14:00', '18:00'],
        // GT-12077: recall/preview 权限默认开启 → portal_base_url 必填。GET 在其为空时
        // 会整个省略该键（omitempty），所以原样回填 original 是存不回去的（400）。
        portal_base_url:
          original.quarantine.portal_base_url || 'https://gw.example.com',
      },
    };

    const putResp = await request.put(
      'http://localhost:18080/api/v1/disposal-settings',
      {
        data: modified,
        headers: { ...authHeaders, 'Content-Type': 'application/json' },
      },
    );
    expect(putResp.status()).toBe(200);
    const saved = await putResp.json();
    expect(saved.quarantine.notify_frequency).toBe('custom');
    expect(saved.quarantine.custom_weekdays).toEqual([1, 2, 3, 4, 5]);
    expect(saved.quarantine.notify_times).toEqual(['09:00', '14:00', '18:00']);

    const restoreResp = await request.put(
      'http://localhost:18080/api/v1/disposal-settings',
      {
        // 同上：原样回填 original 会因缺 portal_base_url 被拒，还原时同样要带上。
        data: {
          ...original,
          quarantine: {
            ...original.quarantine,
            portal_base_url:
              original.quarantine.portal_base_url || 'https://gw.example.com',
          },
        },
        headers: { ...authHeaders, 'Content-Type': 'application/json' },
      },
    );
    expect(restoreResp.status()).toBe(200);
  });

  test('隔离区 HH:MM 时间点添加和删除', async ({ authenticatedPage }) => {
    // Scope the combobox lookups to the active tab panel: in the multi-tenant
    // ("云网关") view a page-level tenant-selector combobox is rendered ABOVE
    // the tabs, which would shift a page-wide getByRole('combobox') index. The
    // frequency/hour/minute selects all live inside the quarantine tab panel,
    // where they are the 1st/2nd/3rd comboboxes respectively.
    const panel = authenticatedPage.getByRole('tabpanel');
    // Select hour "14" from the second combobox in the panel (first is frequency).
    const hourSelect = panel.getByRole('combobox').nth(1);
    await hourSelect.click();
    await authenticatedPage.getByRole('option', { name: '14' }).click();
    await expect(hourSelect).toContainText('14');

    // Select minute "30" from the third combobox in the panel.
    const minuteSelect = panel.getByRole('combobox').nth(2);
    await minuteSelect.click();
    await authenticatedPage.getByRole('option', { name: '30' }).click();
    await expect(minuteSelect).toContainText('30');

    // Click "+ 添加时间点" button.
    await authenticatedPage.getByRole('button', { name: /添加时间点/ }).click();

    // Verify the tag "14:30" appears.
    await expect(authenticatedPage.getByText('14:30', { exact: true })).toBeVisible();

    // Remove the tag by clicking its X button.
    await authenticatedPage
      .locator('.rounded-md.bg-blue-50')
      .filter({ hasText: '14:30' })
      .getByRole('button')
      .click();

    // Verify the tag is removed.
    await expect(authenticatedPage.getByText('14:30', { exact: true })).not.toBeVisible();
  });
});
