// One-off script to regenerate the GT-12826 doc screenshots with correct CJK
// font rendering. Uses the locally-installed Playwright Chromium (this VM has
// google-noto-sans-cjk-ttc-fonts installed) against the dev-only
// /zh/dev-screenshot-gt12826 route, which renders ContentRuleDrawer with a
// mocked auth context. The single network call the drawer makes
// (testContentRule -> POST /api/v1/unified-rules/test) is intercepted so no
// live backend is required.
//
// Usage: node scripts/capture-gt12826-screenshots.mjs
import { chromium } from '@playwright/test';
import path from 'node:path';

const BASE_URL = 'http://127.0.0.1:3000';
const OUT_DIR = path.resolve(
  import.meta.dirname,
  '..',
  'doc',
  'html_spec-version',
  'screenshots',
);

async function main() {
  const browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: 1588, height: 920 } });
  // The proxy (src/proxy.ts) gates every non-login/portal route on the
  // presence of the osgateway_token HttpOnly cookie. Set a dummy value so it
  // does not redirect our dev-only route to /login (the mocked AuthContext on
  // the page itself is what actually drives rendering, not this cookie).
  await context.addCookies([
    {
      name: 'osgateway_token',
      value: 'dev-screenshot-token',
      url: BASE_URL,
      httpOnly: true,
    },
  ]);
  const page = await context.newPage();
  await page.emulateMedia({ colorScheme: 'dark' });

  // Intercept the simulate-test API call. We flip the mocked response between
  // matched/not-matched between runs via `currentMatch`.
  let currentMatch = true;
  await page.route('**/api/v1/unified-rules/test**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ matched: currentMatch, evaluated_conditions: [] }),
    });
  });

  page.on('console', (msg) => console.log('[browser]', msg.type(), msg.text()));
  page.on('pageerror', (err) => console.log('[pageerror]', err.message));
  page.on('requestfailed', (req) => {
    if (!req.url().includes('webpack-hmr')) {
      console.log('[requestfailed]', req.url(), req.failure()?.errorText);
    }
  });
  page.on('response', (res) => {
    if (res.status() >= 400 && !res.url().includes('webpack-hmr')) {
      console.log('[badresponse]', res.status(), res.url());
    }
  });

  const resp = await page.goto(`${BASE_URL}/zh/dev-screenshot-gt12826`, {
    waitUntil: 'domcontentloaded',
  });
  console.log('[debug] response status:', resp?.status(), 'url:', resp?.url());
  for (let i = 0; i < 5; i++) {
    await page.waitForTimeout(1000);
    const counts = await page.evaluate(() => ({
      drawer: document.querySelectorAll('[data-testid="content-rule-drawer"]').length,
      minimal: document.querySelectorAll('[data-testid="minimal-sheet-content"]').length,
    }));
    console.log(`[poll ${i}]`, JSON.stringify(counts));
    if (counts.drawer > 0) break;
  }
  console.log('[debug] html length:', (await page.content()).length);
  console.log('[debug] final url:', page.url());
  const domInfo = await page.evaluate(() => ({
    dialogCount: document.querySelectorAll('[role="dialog"]').length,
    drawerCount: document.querySelectorAll('[data-testid="content-rule-drawer"]').length,
    rootChildCount: document.getElementById('__next')?.children.length ?? -1,
    bodyChildTags: Array.from(document.body.children).map((el) => el.tagName),
    reactErrorOverlay: !!document.querySelector('nextjs-portal'),
  }));
  console.log('[debug] domInfo:', JSON.stringify(domInfo));
  const errorText = await page.evaluate(() => {
    function walk(node, depth) {
      let out = '';
      const tag = node.tagName || node.nodeName;
      out += `${'  '.repeat(depth)}<${tag}>\n`;
      if (node.shadowRoot) {
        for (const child of node.shadowRoot.children) {
          out += walk(child, depth + 1);
        }
      }
      if (node.children) {
        for (const child of node.children) {
          out += walk(child, depth + 1);
        }
      }
      return out;
    }
    const portal = document.querySelector('nextjs-portal');
    if (!portal) return 'no portal';
    return walk(portal, 0);
  });
  console.log('[debug] portal tree:', errorText);
  const bodyClasses = await page.evaluate(() => document.body.className);
  console.log('[debug] body class:', bodyClasses);
  const rootDivHtml = await page.evaluate(() => {
    const divs = document.querySelectorAll('body > div');
    return Array.from(divs).map((d) => d.outerHTML.slice(0, 200));
  });
  console.log('[debug] root divs:', JSON.stringify(rootDivHtml, null, 2));
  const drawerInfo = await page.evaluate(() => {
    const el = document.querySelector('[data-testid="content-rule-drawer"]');
    if (!el) return { found: false };
    const style = getComputedStyle(el);
    const rect = el.getBoundingClientRect();
    return {
      found: true,
      display: style.display,
      opacity: style.opacity,
      visibility: style.visibility,
      transform: style.transform,
      rect: { w: rect.width, h: rect.height, x: rect.x, y: rect.y },
      dataState: el.getAttribute('data-state'),
    };
  });
  console.log('[debug] drawerInfo:', JSON.stringify(drawerInfo));
  await page.screenshot({ path: '/tmp/debug-initial.png' });
  console.log('[debug] body text:', (await page.textContent('body'))?.slice(0, 500));
  await page.waitForSelector('[data-testid="content-rule-drawer"]', { timeout: 15000 });

  // Fill required match-content field so "运行测试" is enabled.
  await page.getByTestId('content-rule-match-content').fill('aaaa');

  // Open the "模拟测试" collapsible panel.
  await page.getByText('模拟测试', { exact: true }).click();
  await page.waitForSelector('input[placeholder="测试内容"], textarea[placeholder="测试内容"]');

  // --- Matched state ---
  currentMatch = true;
  const testInput = page.locator('textarea[placeholder="测试内容"]').first();
  await testInput.fill('aaaa');
  await page.getByRole('button', { name: '运行测试' }).click();
  await page.waitForSelector('text=匹配', { timeout: 10000 });
  await page.waitForTimeout(300);
  await page.screenshot({
    path: path.join(OUT_DIR, 'gt12826-test-matched-sky.png'),
  });
  console.log('[capture] saved gt12826-test-matched-sky.png');

  // --- Not matched state ---
  currentMatch = false;
  await testInput.fill('zzzz');
  await page.getByRole('button', { name: '运行测试' }).click();
  await page.waitForSelector('text=不匹配', { timeout: 10000 });
  await page.waitForTimeout(300);
  await page.screenshot({
    path: path.join(OUT_DIR, 'gt12826-test-not-matched-neutral.png'),
  });
  console.log('[capture] saved gt12826-test-not-matched-neutral.png');

  await browser.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
