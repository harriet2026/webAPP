import { test, expect } from '../fixtures/auth.fixture';

// Module A (policy pipeline) is tenant-scoped: the platform admin is blocked in
// the multi-tenant dev form (GT-12149 / PRD §1.4), so drive the UI as a tenant_admin.
test.use({ asRole: 'tenant_admin' });




// Review finding 8 (design/implement/spec/2026-07-07-mail-disposal-investigation-center-design.md
// §6.3, plan Task D4): the "邮件类型" (email_type) select-only dropdown was
// only wired into AdvancedRuleEditor.tsx. This spec covers the three other
// admin rule editors that the plan explicitly called out, verifying the selected
// value is actually persisted via the shared /unified-rules API (not just
// visible in the form).
test.describe('Rule editor email_type surfaces', () => {
  test('content rule editor follows the simplified html_spec and hides email_type', async ({ authenticatedPage }) => {
    await authenticatedPage.goto('/zh/security/pipeline');
    await authenticatedPage.waitForLoadState('networkidle');
    await authenticatedPage.waitForTimeout(2000);

    const contentCard = authenticatedPage
      .locator('[class*="cursor-pointer"]')
      .filter({ hasText: /内容规则|Content Rules/ })
      .first();
    await expect(contentCard).toBeVisible({ timeout: 10000 });
    await contentCard.click();
    await authenticatedPage.waitForTimeout(2000);

    const createBtn = authenticatedPage
      .getByRole('button', { name: /新增规则|新建规则|Create Rule|New Rule/ })
      .or(authenticatedPage.locator('button').filter({ has: authenticatedPage.locator('svg.lucide-plus') }))
      .first();
    await expect(createBtn).toBeVisible({ timeout: 5000 });
    await createBtn.click();
    await authenticatedPage.waitForTimeout(2000);

    const sheet = authenticatedPage.locator('[data-slot="sheet-content"]').last();
    await expect(sheet).toBeVisible({ timeout: 5000 });

    const emailTypeSelect = sheet.locator('[data-testid="content-rule-email-type"]');
    await expect(emailTypeSelect).toHaveCount(0);
  });

  // NOTE: the "sender filter editor" email_type case was removed here. The Task 4
  // sender-filter rewrite (a266c059) intentionally dropped the email_type / whitelist_mode
  // / valid_from fields from the sender-filter drawer; SenderFilterDrawer.test.tsx asserts
  // `data-testid="sender-filter-email-type"` is absent. The approved content-rules
  // html_spec alignment now follows the same simplified surface; existing hidden
  // email_type values are still preserved when an older rule is edited.
});
