// GT-12818 截图脚本：在 VM 内用 Playwright chromium（VM 已装 Noto Sans CJK 字体，
// 故中文可正常渲染，不会出现 agent-browser 沙箱的方块乱码）捕获
// 「附件安全检测 → 反病毒引擎 → 发现病毒后的处置」下拉打开态。
//
// 认证：OSGATEWAY_PRODUCT_FORM_SWITCHER=true 时 proxy 的 demo bypass 让所有路由
// 视为已登录（无需 token cookie），AuthProvider 亦会自动恢复 DEMO_SUPER_ADMIN。
// 仅需 osg_form_override=ai-single 选定「AI版·单租户」形态，pipeline 才直出模块卡片。
import { chromium } from '@playwright/test';

// 必须用 localhost（非 127.0.0.1）：Next dev 把 127.0.0.1 视作不允许的跨域 host，
// 会阻断 HMR/客户端水合，导致页面永远停在 auth loading 转圈。
const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';
const OUT = process.env.OUT || '/tmp/gt12818/virus-action-dropdown.png';

async function main() {
  const browser = await chromium.launch();
  const context = await browser.newContext({
    viewport: { width: 1694, height: 1046 },
    deviceScaleFactor: 2,
    locale: 'zh-CN',
    colorScheme: 'light',
  });
  await context.addCookies([{ name: 'osg_form_override', value: 'ai-single', url: BASE_URL }]);

  const page = await context.newPage();
  page.on('pageerror', (e) => console.log('[pageerror]', e.message));

  const configBtn = page.getByTestId('pipeline-policy-config-attachment_security');

  console.log('[step] goto pipeline (cold compile 首访可能数十秒)');
  await page.goto(`${BASE_URL}/zh/security/pipeline`, { waitUntil: 'domcontentloaded', timeout: 120000 });

  // 冷编译期首帧可能只有 auth loading；轮询等待卡片出现，最多 ~2 分钟。
  let ready = false;
  for (let i = 0; i < 40; i++) {
    if (await configBtn.count()) { ready = true; break; }
    await page.waitForTimeout(3000);
    const snip = await page.evaluate(() => document.body.innerText.slice(0, 100).replace(/\s+/g, ' ').trim());
    console.log(`[poll ${i}] hasBtn=${await configBtn.count()} body="${snip}"`);
  }
  if (!ready) {
    await page.screenshot({ path: '/tmp/gt12818/debug-initial.png' });
    throw new Error('attachment config button never appeared');
  }
  await configBtn.first().scrollIntoViewIfNeeded();
  console.log('[step] open attachment-security drawer');
  await configBtn.first().click();

  const antivirusTab = page.getByTestId('tab-antivirus');
  await antivirusTab.waitFor({ state: 'visible', timeout: 30000 });
  console.log('[step] switch to antivirus tab');
  await antivirusTab.click();

  const trigger = page.getByTestId('antivirus-virus-action');
  await trigger.waitFor({ state: 'visible', timeout: 30000 });
  await trigger.scrollIntoViewIfNeeded();
  await page.waitForTimeout(400);
  console.log('[step] open virus-action select');
  await trigger.click();

  await page.getByTestId('antivirus-virus-action-options').waitFor({ state: 'visible', timeout: 15000 });
  await page.waitForTimeout(600);

  const optionTexts = await page
    .getByTestId('antivirus-virus-action-options')
    .locator('[data-testid^="antivirus-virus-action-"]')
    .allInnerTexts();
  console.log('[verify] options =', JSON.stringify(optionTexts));

  await page.screenshot({ path: OUT });
  console.log('[done] screenshot saved to', OUT);

  await browser.close();
}

main().catch((e) => {
  console.error('[fatal]', e);
  process.exit(1);
});
