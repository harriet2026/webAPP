/**
 * Demo deployments can opt into bypassing the login gate by setting
 * OSGATEWAY_PRODUCT_FORM_SWITCHER=true. This is the same server-side switch
 * used to expose the product-form switcher; when it is exactly "true" we also
 * skip the HttpOnly-token auth check so demo environments work without a
 * real session.
 */
export function isDemoAuthBypassEnabled(
  switcherEnv: string | undefined
): boolean {
  return switcherEnv === 'true';
}
