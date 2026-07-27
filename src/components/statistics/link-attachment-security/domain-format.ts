export function formatFirstSeen(
  value: string | null | undefined,
  locale: string,
  fallback = '—',
): string {
  const trimmed = value?.trim();
  if (!trimmed) return fallback;

  // Parse a date-only API value in local time so users west of UTC do not see
  // the previous calendar day. Full RFC3339 timestamps retain their offset.
  const parsed = /^\d{4}-\d{2}-\d{2}$/.test(trimmed)
    ? new Date(`${trimmed}T00:00:00`)
    : new Date(trimmed);
  if (Number.isNaN(parsed.getTime())) return fallback;

  try {
    return new Intl.DateTimeFormat(locale, {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(parsed);
  } catch {
    return new Intl.DateTimeFormat('en', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(parsed);
  }
}
