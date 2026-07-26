import { test, expect } from '../fixtures/auth.fixture';

// Module A (policy pipeline) is tenant-scoped: the platform admin is blocked in
// the multi-tenant dev form (GT-12149 / PRD §1.4), so drive the UI as a tenant_admin.
test.use({ asRole: 'tenant_admin' });




test.describe('Content Rules - No External URLs Scope', () => {
  async function openContentRulesDrawer(page: import('@playwright/test').Page) {
    await page.goto('/zh/security/pipeline');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);

    const contentCard = page
      .locator('[class*="cursor-pointer"]')
      .filter({ hasText: /内容规则|Content Rules/ })
      .first();
    await expect(contentCard).toBeVisible({ timeout: 10000 });
    await contentCard.click();
    await page.waitForTimeout(2000);

    const drawer = page.locator('[data-slot="sheet-content"]').first();
    await expect(drawer).toBeVisible({ timeout: 15000 });
    await page.waitForTimeout(1000);
  }

  async function openCreateRuleForm(page: import('@playwright/test').Page) {
    const createBtn = page
      .getByRole('button', { name: /新增规则|新建规则|Create Rule|New Rule/ })
      .or(page.locator('button').filter({ has: page.locator('svg.lucide-plus') }))
      .first();
    await expect(createBtn).toBeVisible({ timeout: 5000 });
    await createBtn.click();
    await page.waitForTimeout(2000);

    const sheet = page.locator('[data-slot="sheet-content"]').last();
    await expect(sheet).toBeVisible({ timeout: 5000 });
    return sheet;
  }

  test('scope options should not include external_urls', async ({ authenticatedPage }) => {
    await openContentRulesDrawer(authenticatedPage);
    const sheet = await openCreateRuleForm(authenticatedPage);

    const nameInput = sheet.locator('input').first();
    await nameInput.fill('pw-no-ext-urls-scope');

    // Anchor on the checkbox role, not on layout classes. The previous locator
    // ('.grid label span.text-sm', reached only behind an `if (count > 0)` guard)
    // silently stopped matching when 10606a2d re-laid the scope group out as
    // `div.flex > label.text-sm > span` — the label list came back EMPTY, so
    // `some(...)` was false and this test kept "passing" while asserting nothing.
    // Assert a known scope is present first, so a future re-layout fails loudly
    // here instead of quietly voiding the external_urls check below.
    await expect(sheet.getByRole('checkbox', { name: '主题' })).toBeVisible();
    await expect(
      sheet.getByRole('checkbox', { name: /external.?url|外部URL|URL ภายนอก/i }),
    ).toHaveCount(0);
  });

  // 'scope options should include urls' was removed here: the content-rules
  // editor was realigned to the demo html_spec (10606a2d + d8894856), whose
  // approved scope set is the five demo scopes — 主题/正文/信头/附件名称 plus a
  // disabled 附件内容 (see design/implement/spec/2026-07-16-content-rules-html-spec-
  // final-reconciliation.md item 32 "五作用域 ✅"). ScopeChoice dropped 'urls' and
  // 'attachment_types' accordingly, so no URL checkbox can exist in this form.
  // The backend still accepts a 'urls' scope for pre-existing rules (see
  // validContentRuleScopes / ContentRulesTable), which is why the list view can
  // still render it — but the create form deliberately no longer offers it.

  test('existing rule metadata should not reference external_urls scope', async ({ authenticatedPage, request }) => {
    const loginResp = await request.post('http://localhost:18080/api/v1/auth/login', {
      data: { username: 'admin', password: 'admin123' },
    });
    const { token } = await loginResp.json();

    const rulesResp = await request.get('http://localhost:18080/api/v1/unified-rules?page_size=100', {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!rulesResp.ok()) return;

    const body = await rulesResp.json();
    const rules = body.items || [];

    for (const rule of rules) {
      if (rule.metadata?.scopes) {
        expect(rule.metadata.scopes).not.toContain('external_urls');
      }
    }
  });
});
