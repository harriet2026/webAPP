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
  const page = await browser.newPage({ viewport: { width: 1588, height: 920 } });
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

  await page.goto(`${BASE_URL}/zh/dev-screenshot-gt12826`, { waitUntil: 'networkidle' });
  await page.waitForSelector('[data-testid="content-rule-drawer"]');

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
