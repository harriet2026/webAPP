// GT-12818 截图脚本：在 VM 内用 Playwright chromium（VM 已装 Noto Sans CJK 字体，
// 故中文可正常渲染，不会出现 agent-browser 沙箱的方块乱码）捕获
// 「附件安全检测 → 反病毒引擎 → 发现病毒后的处置」下拉打开态。
import { chromium } from '@playwright/test';

const BASE_URL = process.env.BASE_URL || 'http://127.0.0.1:3000';
const OUT = process.env.OUT || '/tmp/gt12818/virus-action-dropdown.png';

async function main() {
  const browser = await chromium.launch();
  const context = await browser.newContext({
    viewport: { width: 1694, height: 1046 },
    deviceScaleFactor: 2,
    locale: 'zh-CN',
    colorScheme: 'light',
  });

  // proxy(src/proxy.ts) 未带 osgateway_token 会 302 到 /login；osg_form_override
  // 选定「AI版·单租户」形态，pipeline 才会直接渲染模块卡片。
  await context.addCookies([
    { name: 'osgateway_token', value: 'gt12818-demo-token', url: BASE_URL, httpOnly: true },
    { name: 'osg_form_override', value: 'ai-single', url: BASE_URL },
  ]);
  // 应用挂载前写入 mock + demo 会话开关（键见 src/lib/mock/storage.ts）。
  await context.addInitScript(() => {
    try {
      localStorage.setItem('osgateway_mock_enabled', '1');
      localStorage.setItem('osgateway_demo_session', '1');
    } catch {}
  });

  const page = await context.newPage();
  page.on('pageerror', (e) => console.log('[pageerror]', e.message));
  page.on('console', (m) => {
    const t = m.text();
    if (m.type() === 'error' || m.type() === 'warning') console.log(`[console.${m.type()}]`, t.slice(0, 300));
  });
  page.on('requestfailed', (r) => {
    if (!r.url().includes('hmr') && !r.url().includes('_next/static/chunks/_')) {
      console.log('[requestfailed]', r.url().slice(-80), r.failure()?.errorText);
    }
  });
  page.on('response', (r) => {
    if (r.status() >= 400 && !r.url().includes('hmr')) console.log('[resp]', r.status(), r.url().slice(-90));
  });

  console.log('[step] goto pipeline (warmup)');
  await page.goto(`${BASE_URL}/zh/security/pipeline`, { waitUntil: 'networkidle', timeout: 90000 });

  // 冷编译时首帧只有 auth loading 转圈；轮询等待附件安全卡片出现，
  // 必要时 reload 一次触发已编译产物直出。
  const configBtn = page.getByTestId('pipeline-policy-config-attachment');
  let ready = false;
  for (let i = 0; i < 12; i++) {
    if (await configBtn.count()) { ready = true; break; }
    await page.waitForTimeout(2500);
    if (i === 3) {
      console.log('[step] reload after warmup');
      await page.reload({ waitUntil: 'networkidle', timeout: 90000 });
    }
    const snip = await page.evaluate(() => document.body.innerText.slice(0, 120).replace(/\n+/g, ' | '));
    console.log(`[poll ${i}] hasBtn=${await configBtn.count()} body="${snip}"`);
  }
  if (!ready) {
    await page.screenshot({ path: '/tmp/gt12818/debug-initial.png' });
    throw new Error('attachment config button never appeared');
  }
  await configBtn.first().waitFor({ state: 'visible', timeout: 20000 });
  console.log('[step] open attachment-security drawer');
  await configBtn.click();

  // 抽屉内切到「反病毒引擎」页签
  const antivirusTab = page.getByTestId('tab-antivirus');
  await antivirusTab.waitFor({ state: 'visible', timeout: 20000 });
  console.log('[step] switch to antivirus tab');
  await antivirusTab.click();

  // 打开「发现病毒后的处置」下拉
  const trigger = page.getByTestId('antivirus-virus-action');
  await trigger.waitFor({ state: 'visible', timeout: 20000 });
  await trigger.scrollIntoViewIfNeeded();
  await page.waitForTimeout(300);
  console.log('[step] open virus-action select');
  await trigger.click();

  // 等选项面板出现
  await page.getByTestId('antivirus-virus-action-options').waitFor({ state: 'visible', timeout: 10000 });
  await page.waitForTimeout(500);

  // 核对候选项权威文本
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
