import { Page, Locator } from '@playwright/test';

export class ProfilePage {
  readonly page: Page;
  readonly heading: Locator;
  readonly tabsList: Locator;

  constructor(page: Page) {
    this.page = page;
    this.heading = page.locator('main h1, h1').first();
    this.tabsList = page.locator('[role="tablist"]').first();
  }

  async goto() {
    await this.page.goto('/zh/profile');
    await this.page.waitForLoadState('networkidle');
    await this.page.waitForTimeout(800);
  }

  async expectLoaded() {
    await this.heading.waitFor({ state: 'visible' });
    await this.tabsList.waitFor({ state: 'visible' });
  }

  async switchTab(value: 'account' | 'password' | 'twoFactor' | 'devices' | 'history') {
    const tab = this.page.locator(`[role="tab"][value="${value}"], [data-state="active"][value="${value}"], button[role="tab"]`).filter({ hasText: this._tabLabel(value) }).first();
    await tab.click();
    await this.page.waitForTimeout(500);
  }

  private _tabLabel(value: string): RegExp {
    switch (value) {
      case 'account': return /账号信息|Account/i;
      case 'password': return /密码修改|Password/i;
      case 'twoFactor': return /二次认证|Two/i;
      // The session-management tab (login sessions + per-device logout) is
      // labelled 登录会话; 授信终端 is the separate trusted-devices tab (no
      // logout controls). TC-B07/B08 drive the sessions tab.
      case 'devices': return /登录会话|Sessions/i;
      case 'history': return /登录历史|History/i;
      default: return new RegExp(value, 'i');
    }
  }

  nameInput() {
    return this.page.locator('[data-testid="profile-account-name-input"]');
  }
  nameError() {
    return this.page.locator('[data-testid="profile-account-name-error"]');
  }
  saveAccountButton() {
    return this.page.locator('[data-testid="profile-account-save"]');
  }
  phoneInput() {
    return this.page.locator('[data-testid="profile-account-phone-input"]');
  }
  phoneSendCodeButton() {
    return this.page.locator('[data-testid="profile-account-phone-send-code"]');
  }

  oldPasswordInput() {
    return this.page.locator('[data-testid="profile-password-old-input"]');
  }
  newPasswordInput() {
    return this.page.locator('[data-testid="profile-password-new-input"]');
  }
  confirmPasswordInput() {
    return this.page.locator('[data-testid="profile-password-confirm-input"]');
  }
  passwordSaveButton() {
    return this.page.locator('[data-testid="profile-password-save"]');
  }

  historyStartDate() {
    return this.page.locator('[data-testid="profile-history-start-date"]');
  }
  historyEndDate() {
    return this.page.locator('[data-testid="profile-history-end-date"]');
  }
  historyQueryButton() {
    return this.page.locator('[data-testid="profile-history-query"]');
  }
  historyTable() {
    return this.page.locator('[data-testid="profile-history-table"]');
  }
  historyRows() {
    return this.historyTable().locator('tbody tr');
  }
  historyDataRows() {
    const rows = this.historyTable().locator('tbody tr');
    return rows.filter({ hasNot: this.page.locator('text=/暂无记录|No data|empty/i') });
  }

  deviceRows() {
    return this.page.locator('[data-testid^="profile-device-logout-"]');
  }
  deviceLogoutButton(jtiOrId: string) {
    return this.page.locator(`[data-testid="profile-device-logout-${jtiOrId}"]`);
  }
  deviceSingleConfirm() {
    return this.page.locator('[data-testid="profile-device-single-confirm"]');
  }
  deviceLogoutOthersButton() {
    return this.page.locator('[data-testid="profile-devices-logout-others"]');
  }
  deviceBatchConfirm() {
    return this.page.locator('[data-testid="profile-device-batch-confirm"]');
  }
  deviceBatchDescription() {
    return this.page.locator('[role="alertdialog"]').last().locator('p, [data-slot="alert-dialog-description"], div').filter({ hasText: /\d+/ }).first();
  }
}
