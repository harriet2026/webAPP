import { test, expect } from '../../fixtures/auth.fixture';
import { navigateToAttachmentSecurity } from './helpers';

const EXPECTED_TABS_ZH: Record<string, string> = {
  basicLimit: '基础限制',
  antivirus: '反病毒引擎',
  image: '图片识别',
  encrypted: '加密附件',
};

test.describe('i18n Chinese (zh)', () => {
  test.beforeEach(async ({ authenticatedPage }) => {
    await navigateToAttachmentSecurity(authenticatedPage);
  });

  test('title is in Chinese', async ({ authenticatedPage }) => {
    const title = authenticatedPage.locator('[data-testid="attachment-security-title"]');
    await expect(title).toHaveText('附件安全检测');
  });

  test('tab labels are in Chinese', async ({ authenticatedPage }) => {
    for (const [key, expectedText] of Object.entries(EXPECTED_TABS_ZH)) {
      const tab = authenticatedPage.locator(`[data-testid="tab-${key}"]`);
      const text = await tab.textContent();
      expect(text).toContain(expectedText);
    }
  });

  test('is receive-only and has no direction switcher', async ({ authenticatedPage }) => {
    await expect(authenticatedPage.getByTestId('basic-limit-tab')).toContainText('收信方向');
    await expect(authenticatedPage.locator('[data-testid^="direction-"]')).toHaveCount(0);
  });

  test('master switch label is in Chinese', async ({ authenticatedPage }) => {
    // ModuleMasterSwitch 容器（data-testid 由 page prop 派生）。
    const switchContainer = authenticatedPage.locator(
      '[data-testid="module-master-switch-attachment_security"]',
    );
    await expect(switchContainer).toBeVisible();
    // Badge 文案在 zh 下是「已启用」/「已禁用」。
    const text = await switchContainer.textContent();
    expect(text).toMatch(/已启用|已禁用/);
  });

  test('module disabled text is in Chinese', async ({ authenticatedPage }) => {
    await authenticatedPage.locator('[data-testid="master-switch-toggle"]').click();
    const overlay = authenticatedPage.locator('[data-testid="module-disabled-overlay"]');
    await expect(overlay).toBeVisible();
    const text = await overlay.textContent();
    expect(text).toContain('关闭本模块后');
  });

  test('basic limit form labels are in Chinese', async ({ authenticatedPage }) => {
    const tab = authenticatedPage.locator('[data-testid="basic-limit-tab"]');
    const text = await tab.textContent();
    expect(text).toContain('附件结构限制');
    expect(text).toContain('单个邮件附件个数上限');
    expect(text).toContain('单个附件大小上限');
  });
});
