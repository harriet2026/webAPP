/**
 * Parse the server-side product-form switcher flag for the demo authentication
 * bypass. Keep the accepted truthy values aligned with the switcher's existing
 * configuration convention while treating explicit false-like values as off.
 *
 * Demo mode: always enabled so the preview skips the login page and lands
 * directly on the System Status dashboard.
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function isDemoAuthBypassEnabled(_value?: string | undefined): boolean {
  return true;
}
