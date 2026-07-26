import { Page } from '@playwright/test';

export async function navigateToAttachmentSecurity(page: Page, locale = 'zh') {
  await page.evaluate(() => localStorage.setItem('osgateway_mock_enabled', '1'));
  await page.context().addCookies([{ name: 'osg_form_override', value: 'ai-single', domain: 'localhost', path: '/' }]);
  await page.goto(`/${locale}/security/pipeline`);
  await page.waitForLoadState('networkidle');
  const attachmentCard = page.locator('[data-testid="pipeline-policy-card-attachment"]');
  await attachmentCard.waitFor({ state: 'visible', timeout: 15000 });
  await attachmentCard.click();
  await page.waitForSelector('[data-testid="attachment-security-page"]', { timeout: 10000 });
}

export async function switchToTab(page: Page, tabKey: string) {
  await page.click(`[data-testid="tab-${tabKey}"]`);
  await page.waitForTimeout(300);
}

// 必须用绝对的 apiserver 地址：相对路径会走 webapp origin，而 runner 的
// PLAYWRIGHT_BASE_URL 是 http://localhost，webapp 把 http 301 到 https —— 301 会
// 把 POST 降级成 GET 并丢掉请求体，登录直接变成 400 {"code":"invalid_request",
// "message":"EOF"}，于是这里静默返回 undefined。
const API_BASE_URL = process.env.API_BASE_URL || 'http://localhost:18080/api/v1';

export async function getAdminToken(page: Page): Promise<string> {
  const response = await page.request.post(`${API_BASE_URL}/auth/login`, {
    data: { username: 'admin', password: 'admin123' },
  });
  if (!response.ok()) {
    throw new Error(`admin login failed: ${response.status()} ${await response.text()}`);
  }
  const data = await response.json();
  return data.token;
}
