/**
 * Parse the server-side product-form switcher flag for the demo authentication
 * bypass. Keep the accepted truthy values aligned with the switcher's existing
 * configuration convention while treating explicit false-like values as off.
 */
const DEMO_AUTH_BYPASS_TRUTHY = new Set(['1', 'true', 'yes']);

export function isDemoAuthBypassEnabled(value: string | undefined): boolean {
  return DEMO_AUTH_BYPASS_TRUTHY.has(value?.trim().toLowerCase() ?? '');
}
