import { test, expect } from '../fixtures/auth.fixture';

test.describe('Product Form nav + brand rendering', () => {
  test('brand reflects SaaS form (cloud)', async ({ authenticatedPage }) => {
    // Dev compose runs OSG_PRODUCT_FORM=cloud (SaaS); brand is "云邮件安全网关"
    // (vs self-hosted "邮件安全网关").
    await expect(authenticatedPage.getByText('云邮件安全网关', { exact: true })).toBeVisible();
  });

  test('bootstrap response carries cloud form', async ({ authenticatedPage }) => {
    const bootstrapResponse = authenticatedPage.waitForResponse(
      (r) => r.url().endsWith('/api/v1/bootstrap') && r.ok(),
    );
    // reload() keeps the fixture's locale-prefixed URL (/zh/dashboard) and
    // re-mounts ProductFormProvider, reliably re-fetching bootstrap.
    await authenticatedPage.reload();
    const resp = await bootstrapResponse;
    const body = await resp.json();
    expect(body.form).toBe('cloud');
    expect(body.capabilities.multiTenant).toBe(true);
    expect(body.capabilities.saas).toBe(true);
    expect(Array.isArray(body.featureRegistry)).toBe(true);
    expect(body.featureRegistry.length).toBeGreaterThan(0);
  });

  test('sidebar renders navigation', async ({ authenticatedPage }) => {
    const nav = authenticatedPage.locator('nav').first();
    await expect(nav).toBeVisible();
    const navButtons = nav.locator('button');
    await expect(navButtons.first()).toBeVisible();
    // Additive-safety invariant: the form filter must not hide the whole nav.
    expect(await navButtons.count()).toBeGreaterThan(0);
  });
});
