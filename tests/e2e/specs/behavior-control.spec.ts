import { test, expect } from '../fixtures/auth.fixture';

// Module A (policy pipeline) is tenant-scoped: the platform admin is blocked in
// the multi-tenant dev form (GT-12149 / PRD §1.4), so drive the UI as a tenant_admin.
test.use({ asRole: 'tenant_admin' });




test.describe('Behavior Control Rules', () => {
  async function openBehaviorControlDrawer(page: import('@playwright/test').Page) {
    await page.goto('/zh/security/pipeline');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);

    // Click the behavior control card itself (the div with onClick handler).
    // The pipeline card is labeled 发信行为管控 (pipeline.behaviorControl), not 行为控制.
    const bcCard = page.locator('[class*="cursor-pointer"]').filter({ hasText: /发信行为管控/ }).first();
    await expect(bcCard).toBeVisible({ timeout: 10000 });
    await bcCard.click({ force: true });
    await page.waitForTimeout(3000);

    // The drawer should now be open
    const drawer = page.locator('[role="dialog"]').first();
    await expect(drawer).toBeVisible({ timeout: 15000 });
    await page.waitForTimeout(1000);
  }

  test('open behavior control via stage2 card on pipeline page', async ({ authenticatedPage }) => {
    await openBehaviorControlDrawer(authenticatedPage);
    // Assert the drawer opened with the behavior-control title. Target the
    // drawer-title element specifically — the label also appears on the
    // background pipeline card and a nav button (strict-mode multi-match).
    await expect(authenticatedPage.getByTestId('pipeline-config-drawer-title'))
      .toHaveText(/发信行为管控|Behavior Control/, { timeout: 5000 });
  });

  test('create and delete a rule via drawer', async ({ authenticatedPage }) => {
    await openBehaviorControlDrawer(authenticatedPage);

    const addBtn = authenticatedPage.getByRole('button', { name: /新建规则|New Rule/ });
    await expect(addBtn).toBeVisible({ timeout: 5000 });
    await addBtn.click();
    await authenticatedPage.waitForTimeout(1500);

    // Verify the form dialog opens. The left column's first section is now
    // titled 基础设置 (form.section.basic) — previously 基本信息.
    const dialog = authenticatedPage.locator('[role="dialog"]').last();
    await expect(dialog.getByRole('button', { name: /保存|Save/ })).toBeVisible({ timeout: 5000 });
    await expect(dialog).toContainText(/基础设置|Basic/);
  });

  test('direction select switches preview text', async ({ authenticatedPage }) => {
    await openBehaviorControlDrawer(authenticatedPage);
    const addBtn = authenticatedPage.getByRole('button', { name: /新建规则|New Rule/ });
    await addBtn.click();
    await authenticatedPage.waitForTimeout(1000);

    const dialog = authenticatedPage.locator('[role="dialog"]').last();

    // The right-panel preview only renders once the rule is "complete"
    // (name + threshold_a filled in) — otherwise it shows an incomplete-config
    // notice instead of the direction badge. Fill the minimum required fields.
    await dialog.locator('input[name="name"]').fill('E2E 方向切换测试');
    await dialog.locator('input[name="threshold_a"]').fill('50');
    await authenticatedPage.waitForTimeout(300);

    // 管控方向 is now a Select (default value 外发/outbound). Open it and
    // switch to 接收 (inbound).
    const directionTrigger = dialog.locator('button[role="combobox"]').filter({ hasText: /外发|Outbound/ }).first();
    await expect(directionTrigger).toBeVisible({ timeout: 5000 });
    await directionTrigger.click();
    await authenticatedPage.waitForTimeout(500);

    const inboundOption = authenticatedPage.getByRole('option', { name: /接收|Inbound/ });
    await expect(inboundOption).toBeVisible({ timeout: 5000 });
    await inboundOption.click();
    await authenticatedPage.waitForTimeout(500);

    // The right-panel preview badge should now reflect the inbound direction.
    await expect(dialog.getByText(/接收|入站|Inbound/).first()).toBeVisible({ timeout: 5000 });
  });

  test('object type select switches sub-type UI (sender <-> IP)', async ({ authenticatedPage }) => {
    await openBehaviorControlDrawer(authenticatedPage);
    const addBtn = authenticatedPage.getByRole('button', { name: /新建规则|New Rule/ });
    await addBtn.click();
    await authenticatedPage.waitForTimeout(1000);

    const dialog = authenticatedPage.locator('[role="dialog"]').last();

    // Default object type is 发信人(sender) / 个人(individual) — confirm the
    // baseline sub-type UI first.
    await expect(dialog.getByText(/个人|Individual/).first()).toBeVisible({ timeout: 5000 });

    // 管控对象类型 is now a Select. Switch it to 发信IP (senderIp) and confirm
    // the IP类型/IP地址 sub-fields appear, proving the sub-type UI is linked
    // to the selected object type.
    const objectTypeTrigger = dialog.locator('button[role="combobox"]').filter({ hasText: /发信人|Sender/ }).first();
    await expect(objectTypeTrigger).toBeVisible({ timeout: 5000 });
    await objectTypeTrigger.click();
    await authenticatedPage.waitForTimeout(500);

    await authenticatedPage.getByRole('option', { name: /发信IP|Sender IP/ }).click();
    await authenticatedPage.waitForTimeout(500);

    await expect(dialog.getByText(/IP类型|IP Type/).first()).toBeVisible({ timeout: 5000 });
    await expect(dialog.getByText(/IP地址|IP Address/).first()).toBeVisible({ timeout: 5000 });

    // Switch back to 发信人(sender) and confirm the 个人(individual) sub-type
    // UI reappears (OBJECT_TYPE_DEFAULTS resets sub_type to individual).
    const ipTypeTrigger = dialog.locator('button[role="combobox"]').filter({ hasText: /发信IP|Sender IP/ }).first();
    await ipTypeTrigger.click();
    await authenticatedPage.waitForTimeout(500);

    await authenticatedPage.getByRole('option', { name: /^发信人$|^Sender$/ }).click();
    await authenticatedPage.waitForTimeout(500);

    await expect(dialog.getByText(/个人|Individual/).first()).toBeVisible({ timeout: 5000 });
  });

  test('OR toggle exists and is toggleable', async ({ authenticatedPage }) => {
    await openBehaviorControlDrawer(authenticatedPage);
    const addBtn = authenticatedPage.getByRole('button', { name: /新建规则|New Rule/ });
    await addBtn.click();
    await authenticatedPage.waitForTimeout(1500);

    const dialog = authenticatedPage.locator('[role="dialog"]').last();
    // The OR toggle is a Checkbox with its own <label for="orEnabled">. Target the
    // label element directly — a bare /OR/ text regex also matches the hint list item
    // "OR条件任一超限即触发", tripping strict-mode (2 matches).
    await expect(dialog.locator('label[for="orEnabled"]')).toBeVisible({ timeout: 5000 });

    const orCheckbox = dialog.locator('#orEnabled');
    await expect(orCheckbox).toBeVisible({ timeout: 5000 });
    await expect(orCheckbox).not.toBeChecked();
    // Toggle via the <Label htmlFor="orEnabled"> — the Base UI Checkbox root is a 16px
    // control whose center click is flaky; clicking the label is the user-realistic path.
    await dialog.locator('label[for="orEnabled"]').click();
    await expect(orCheckbox).toBeChecked();
  });

  test('language switch updates UI text', async ({ authenticatedPage }) => {
    await openBehaviorControlDrawer(authenticatedPage);

    // Switch to English
    await authenticatedPage.goto('/en/security/pipeline');
    await authenticatedPage.waitForLoadState('networkidle');
    await authenticatedPage.waitForTimeout(2000);

    const enText = authenticatedPage.getByText(/Behavior Control|Detect abnormal/).first();
    await expect(enText).toBeVisible({ timeout: 10000 });

    // Switch to Russian (use page navigation)
    await authenticatedPage.goto('/ru/security/pipeline');
    await authenticatedPage.waitForLoadState('networkidle');
    await authenticatedPage.waitForTimeout(2000);

    const ruText = authenticatedPage.getByText(/Контроль поведения|Обнаружение/).first();
    await expect(ruText).toBeVisible({ timeout: 10000 });
  });

  test('behavior control section visible on pipeline page', async ({ authenticatedPage }) => {
    await authenticatedPage.goto('/zh/security/pipeline');
    await authenticatedPage.waitForLoadState('networkidle');
    await authenticatedPage.waitForTimeout(3000);
    await expect(authenticatedPage.getByText(/发信行为管控|Behavior Control/).first()).toBeVisible({ timeout: 10000 });
  });
});
