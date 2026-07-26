import { test, expect } from '../fixtures/auth.fixture';

// GT-12257: the product registry already hides this tenant-scoped feature in
// the platform sidebar. This test closes the deep-link bypass as well.
test('platform administrator without a tenant cannot open group management directly', async ({ authenticatedPage }) => {
  await authenticatedPage.evaluate(() => {
    localStorage.removeItem('osgateway_selected_tenant');
    document.cookie = 'osg_selected_tenant=; Max-Age=0; path=/';
    document.cookie = 'osg_viewer=platform; path=/; SameSite=Strict';
  });

  await authenticatedPage.goto('/zh/security/groups');
  await expect(authenticatedPage.getByTestId('group-management-tenant-required')).toBeVisible({ timeout: 15000 });
  await expect(authenticatedPage.getByTestId('group-policy-card')).toHaveCount(0);
});
