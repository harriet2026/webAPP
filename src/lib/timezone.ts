/**
 * Resolve the browser's IANA time zone (e.g. "Asia/Shanghai").
 * Returns "" if the environment does not expose it, so callers can treat
 * empty as "unknown" rather than crashing.
 */
export function getBrowserTz(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || '';
  } catch {
    return '';
  }
}
