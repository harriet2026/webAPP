import { test, expect } from '../fixtures/auth.fixture';


import { createAuthenticatedClient } from '../fixtures/api.fixture';
import { uniqueSuffix } from '../helpers/test-data';

// Module A (policy pipeline) is tenant-scoped: the platform admin is blocked in
// the multi-tenant dev form (GT-12149 / PRD §1.4), so drive the UI as a tenant_admin.
test.use({ asRole: 'tenant_admin' });


test.describe('Mail Marking & Disclaimer', () => {
  function uid(): string {
    return uniqueSuffix();
  }

  async function openMailMarkingDrawer(page: import('@playwright/test').Page, tenantId = 1) {
    // In multi-tenant form the platform administrator is intentionally blocked
    // from tenant policy modules. The fixture authenticates with the seeded
    // system admin, so switch only the client-side viewer role to the tenant
    // surface while retaining the valid admin cookie for API setup/cleanup.
    await page.evaluate((selectedTenantId) => {
      const raw = localStorage.getItem('osgateway_user');
      const user = raw ? JSON.parse(raw) : { id: 0, username: 'admin' };
      localStorage.setItem('osgateway_user', JSON.stringify({ ...user, role: 'tenant_admin', tenant_id: selectedTenantId }));
    }, tenantId);
    await page.goto('/zh/security/pipeline');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);

    // The pipeline page card for mail marking
    const card = page.getByTestId('pipeline-policy-card-mailMarking');
    await expect(card).toBeVisible({ timeout: 10000 });
    await card.click();
    await page.waitForTimeout(2000);

    const drawer = page.getByTestId('pipeline-config-drawer');
    await expect(drawer).toBeVisible({ timeout: 15000 });
    await page.waitForTimeout(1000);
    return drawer;
  }

  async function apiCreateMarkRule(
    request: import('@playwright/test').APIRequestContext,
    name: string,
    direction: 'receive' | 'send',
  ): Promise<{ id: number; tenantId: number }> {
    const api = await createAuthenticatedClient(request);
    const tenantId = api.getTenantId();
    expect(tenantId).not.toBeNull();
    const isOutbound = direction === 'send';
    const metadata = isOutbound
      ? { feature: 'mail_marking', direction: 'send', disclaimer: { content: 'Test disclaimer', positions: ['body_bottom'], format: 'auto' } }
      : { feature: 'mail_marking', direction: 'receive', mark: { text: '[TEST]', positions: ['subject_prefix'], style: 'plain_text' } };
    const resp = await api.post('/unified-rules', {
      name,
      rule_class: 'action',
      stage: 'data',
      action: 'accept',
      page: 'mail_marking',
      priority: 9500,
      condition_tree: { type: 'condition', field: 'is_outbound', operator: 'eq', value: isOutbound ? 'true' : 'false' },
      metadata,
      is_active: true,
      tags: [],
    });
    expect(resp.ok()).toBeTruthy();
    return { id: (await resp.json()).id as number, tenantId: tenantId as number };
  }

  async function apiDeleteRule(request: import('@playwright/test').APIRequestContext, id: number) {
    const api = await createAuthenticatedClient(request);
    await api.delete(`/unified-rules/${id}`).catch(() => {});
  }

  // ── 1. Drawer opens from pipeline stage5 card ─────────────────────────────────

  test('open mail-marking drawer from stage5 pipeline card', async ({ authenticatedPage }) => {
    const drawer = await openMailMarkingDrawer(authenticatedPage);
    await expect(drawer.getByText(/邮件标记与声明|Mail Marking/).first()).toBeVisible({ timeout: 5000 });
  });

  // ── 2. Tab switch changes direction content ───────────────────────────────────

  test('tab switch between receive and send changes content', async ({ authenticatedPage }) => {
    const drawer = await openMailMarkingDrawer(authenticatedPage);

    const receiveTab = drawer.getByTestId('mail-marking-tab-receive');
    const sendTab = drawer.getByTestId('mail-marking-tab-send');
    await expect(receiveTab).toBeVisible({ timeout: 5000 });
    await expect(sendTab).toBeVisible({ timeout: 5000 });

    // Switch to send
    await sendTab.click();
    await authenticatedPage.waitForTimeout(600);
    // "新建规则" button should still be present in both tabs
    await expect(drawer.getByTestId('mail-marking-create-rule')).toBeVisible({ timeout: 5000 });

    // Switch back to receive
    await receiveTab.click();
    await authenticatedPage.waitForTimeout(600);
    await expect(drawer.getByTestId('mail-marking-create-rule')).toBeVisible({ timeout: 5000 });
  });

  // ── 3. Create rule button opens nested sheet ──────────────────────────────────

  test('create-rule button opens rule edit sheet for receive direction', async ({ authenticatedPage }) => {
    const drawer = await openMailMarkingDrawer(authenticatedPage);

    const createBtn = drawer.getByTestId('mail-marking-create-rule');
    await expect(createBtn).toBeVisible({ timeout: 5000 });
    await createBtn.click();
    await authenticatedPage.waitForTimeout(2000);

    const ruleSheet = authenticatedPage.getByTestId('mail-marking-rule-editor');
    await expect(ruleSheet).toBeVisible({ timeout: 8000 });
    await expect(ruleSheet.getByText(/新建接收标记规则|Create.*Receive.*Rule/i)).toBeVisible({ timeout: 5000 });
  });

  test('create-rule button opens rule edit sheet for send direction', async ({ authenticatedPage }) => {
    const drawer = await openMailMarkingDrawer(authenticatedPage);

    const sendTab = drawer.getByTestId('mail-marking-tab-send');
    await sendTab.click();
    await authenticatedPage.waitForTimeout(600);

    const createBtn = drawer.getByTestId('mail-marking-create-rule');
    await createBtn.click();
    await authenticatedPage.waitForTimeout(2000);

    const ruleSheet = authenticatedPage.getByTestId('mail-marking-rule-editor');
    await expect(ruleSheet).toBeVisible({ timeout: 8000 });
    await expect(ruleSheet.getByText(/新建外发声明规则|Create.*Send.*Rule/i)).toBeVisible({ timeout: 5000 });
  });

  // ── 4. Form validation: Save remains clickable and shows inline errors ─────────

  test('save button stays enabled and shows inline validation when rule name is empty', async ({ authenticatedPage }) => {
    const drawer = await openMailMarkingDrawer(authenticatedPage);
    const createBtn = drawer.getByTestId('mail-marking-create-rule');
    await createBtn.click();
    await authenticatedPage.waitForTimeout(1500);

    const ruleSheet = authenticatedPage.getByTestId('mail-marking-rule-editor');
    const saveBtn = ruleSheet.getByTestId('mail-marking-save-rule');
    await expect(saveBtn).toBeEnabled({ timeout: 5000 });
    await saveBtn.click();
    await expect(ruleSheet.locator('[role="alert"]').first()).toContainText(/请输入规则名称|Enter a rule name/);
  });

  test('save button enabled after filling name', async ({ authenticatedPage }) => {
    const drawer = await openMailMarkingDrawer(authenticatedPage);
    const createBtn = drawer.getByTestId('mail-marking-create-rule');
    await createBtn.click();
    await authenticatedPage.waitForTimeout(1500);

    const ruleSheet = authenticatedPage.getByTestId('mail-marking-rule-editor');
    const nameInput = ruleSheet.getByTestId('mail-marking-rule-name');
    await nameInput.fill(`pw-valid-${uniqueSuffix()}`);
    await authenticatedPage.waitForTimeout(300);

    const saveBtn = ruleSheet.getByTestId('mail-marking-save-rule');
    await expect(saveBtn).toBeEnabled({ timeout: 3000 });
  });

  // ── 5. Preview renders with form content ─────────────────────────────────────

  test('mark preview section is visible in create rule sheet', async ({ authenticatedPage }) => {
    const drawer = await openMailMarkingDrawer(authenticatedPage);
    const createBtn = drawer.getByTestId('mail-marking-create-rule');
    await createBtn.click();
    await authenticatedPage.waitForTimeout(1500);

    const ruleSheet = authenticatedPage.getByTestId('mail-marking-rule-editor');
    // The preview section heading
    await expect(ruleSheet.getByText(/预览效果|Preview/i)).toBeVisible({ timeout: 5000 });
  });

  // ── 6. Delete confirmation dialog ────────────────────────────────────────────

  test('delete button shows confirmation dialog with rule name', async ({ authenticatedPage, request }) => {
    const name = `${uid()}-delconf`;
    const { id, tenantId } = await apiCreateMarkRule(request, name, 'receive');

    try {
      await openMailMarkingDrawer(authenticatedPage, tenantId);
      await authenticatedPage.waitForTimeout(1500);

      const ruleRow = authenticatedPage.locator('tr').filter({ hasText: name }).first();
      await expect(ruleRow).toBeVisible({ timeout: 10000 });

      // Click the delete (trash) button in the row
      const deleteBtn = ruleRow.locator('[data-testid^="mail-marking-delete-"]');
      await deleteBtn.click();
      await authenticatedPage.waitForTimeout(800);

      const dialog = authenticatedPage.locator('[role="alertdialog"]').first();
      await expect(dialog).toBeVisible({ timeout: 5000 });
      // Confirmation message includes the rule name
      await expect(dialog.getByText(name)).toBeVisible({ timeout: 3000 });

      // Cancel — rule should still be there
      const cancelBtn = dialog.locator('button').filter({ hasText: /取消|Cancel/ }).first();
      await cancelBtn.click();
      await authenticatedPage.waitForTimeout(500);
      await expect(dialog).not.toBeVisible({ timeout: 3000 });
      await expect(ruleRow).toBeVisible({ timeout: 3000 });
    } finally {
      await apiDeleteRule(request, id);
    }
  });

  test('confirming delete removes the rule from the list', async ({ authenticatedPage, request }) => {
    const name = `${uid()}-delconfirm`;
    const { id, tenantId } = await apiCreateMarkRule(request, name, 'receive');

    try {
      await openMailMarkingDrawer(authenticatedPage, tenantId);
      await authenticatedPage.waitForTimeout(1500);

      const ruleRow = authenticatedPage.locator('tr').filter({ hasText: name }).first();
      await expect(ruleRow).toBeVisible({ timeout: 10000 });

      const deleteBtn = ruleRow.locator('[data-testid^="mail-marking-delete-"]');
      await deleteBtn.click();
      await authenticatedPage.waitForTimeout(800);

      const dialog = authenticatedPage.locator('[role="alertdialog"]').first();
      await expect(dialog).toBeVisible({ timeout: 5000 });

      const deletePromise = authenticatedPage.waitForResponse(
        (resp) => resp.url().includes(`/unified-rules`) && resp.request().method() === 'DELETE',
        { timeout: 10000 },
      );
      const confirmBtn = dialog.locator('button').filter({ hasText: /^删除$|^Delete$/ }).first();
      await confirmBtn.click();
      await deletePromise;
      await authenticatedPage.waitForTimeout(1500);

      await expect(authenticatedPage.locator('tr').filter({ hasText: name })).not.toBeVisible({ timeout: 5000 });
    } finally {
      // best-effort cleanup in case test failed early
      await apiDeleteRule(request, id);
    }
  });

  // ── 7. Edit existing rule populates the form ──────────────────────────────────

  test('edit button opens sheet with existing rule name populated', async ({ authenticatedPage, request }) => {
    const name = `${uid()}-editpop`;
    const { id, tenantId } = await apiCreateMarkRule(request, name, 'receive');

    try {
      await openMailMarkingDrawer(authenticatedPage, tenantId);
      await authenticatedPage.waitForTimeout(1500);

      const ruleRow = authenticatedPage.locator('tr').filter({ hasText: name }).first();
      await expect(ruleRow).toBeVisible({ timeout: 10000 });

      const editBtn = ruleRow.locator('[data-testid^="mail-marking-edit-"]');
      await editBtn.click();
      await authenticatedPage.waitForTimeout(1500);

      const ruleSheet = authenticatedPage.getByTestId('mail-marking-rule-editor');
      await expect(ruleSheet).toBeVisible({ timeout: 8000 });
      // Sheet title should say "编辑"
      await expect(ruleSheet.getByText(/编辑接收标记规则|Edit.*Receive.*Rule/i)).toBeVisible({ timeout: 5000 });
      // Name field should be pre-filled
      const nameInput = ruleSheet.getByTestId('mail-marking-rule-name');
      await expect(nameInput).toHaveValue(name, { timeout: 3000 });
    } finally {
      await apiDeleteRule(request, id);
    }
  });

  // ── 8. API-level CRUD ─────────────────────────────────────────────────────────

  test('API: create receive rule, list it, then delete', async ({ request }) => {
    const api = await createAuthenticatedClient(request);
    const name = `${uid()}-api-recv`;

    const createResp = await api.post('/unified-rules', {
      name,
      rule_class: 'action',
      stage: 'data',
      action: 'accept',
      page: 'mail_marking',
      priority: 9500,
      condition_tree: { type: 'condition', field: 'is_outbound', operator: 'eq', value: 'false' },
      metadata: { feature: 'mail_marking', direction: 'receive', mark: { text: '【外站邮件】', positions: ['subject_prefix'], style: 'plain_text' } },
      is_active: true,
      tags: [],
    });
    expect(createResp.ok()).toBeTruthy();
    const ruleId = (await createResp.json()).id;

    const listResp = await api.get('/unified-rules?page=mail_marking&rule_class=action&stage=data');
    expect(listResp.status()).toBe(200);
    const rules = (await listResp.json()).items ?? [];
    expect(rules.some((r: { id: number }) => r.id === ruleId)).toBeTruthy();

    const delResp = await api.delete(`/unified-rules/${ruleId}`);
    expect([200, 204]).toContain(delResp.status());
  });

  test('API: create send disclaimer rule, then delete', async ({ request }) => {
    const api = await createAuthenticatedClient(request);
    const name = `${uid()}-api-send`;

    const createResp = await api.post('/unified-rules', {
      name,
      rule_class: 'action',
      stage: 'data',
      action: 'accept',
      page: 'mail_marking',
      priority: 9500,
      condition_tree: { type: 'condition', field: 'is_outbound', operator: 'eq', value: 'true' },
      metadata: { feature: 'mail_marking', direction: 'send', disclaimer: { content: '<p>Confidential</p>', positions: ['body_bottom'], format: 'auto' } },
      is_active: true,
      tags: [],
    });
    expect(createResp.ok()).toBeTruthy();
    const ruleId = (await createResp.json()).id;
    const delResp = await api.delete(`/unified-rules/${ruleId}`);
    expect([200, 204]).toContain(delResp.status());
  });

  test('API: list returns only mail_marking rules', async ({ request }) => {
    const api = await createAuthenticatedClient(request);
    const resp = await api.get('/unified-rules?page=mail_marking&rule_class=action&stage=data');
    expect(resp.status()).toBe(200);
    const rules = (await resp.json()).rules ?? [];
    for (const r of rules) {
      expect(r.page).toBe('mail_marking');
    }
  });

  // ── 9. Rule visible in UI after API creation ──────────────────────────────────

  test('rule created via API appears in the UI list', async ({ authenticatedPage, request }) => {
    const name = `${uid()}-ui-visible`;
    const { id, tenantId } = await apiCreateMarkRule(request, name, 'receive');

    try {
      await openMailMarkingDrawer(authenticatedPage, tenantId);
      await authenticatedPage.waitForTimeout(2000);

      const ruleRow = authenticatedPage.locator('tr').filter({ hasText: name }).first();
      await expect(ruleRow).toBeVisible({ timeout: 10000 });
    } finally {
      await apiDeleteRule(request, id);
    }
  });

  test('send rule created via API appears in send tab', async ({ authenticatedPage, request }) => {
    const name = `${uid()}-snd-visible`;
    const { id, tenantId } = await apiCreateMarkRule(request, name, 'send');

    try {
      const drawer = await openMailMarkingDrawer(authenticatedPage, tenantId);

      const sendTab = drawer.getByTestId('mail-marking-tab-send');
      await sendTab.click();
      await authenticatedPage.waitForTimeout(1200);

      await expect(authenticatedPage.locator('tr').filter({ hasText: name }).first()).toBeVisible({ timeout: 10000 });
    } finally {
      await apiDeleteRule(request, id);
    }
  });
});
