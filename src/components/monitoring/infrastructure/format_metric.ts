// Display only: never feed rounded values back into charts or threshold checks.
export function formatMetric(value: unknown, locale: string, digits = 2): string {
  if (typeof value !== 'number' || !Number.isFinite(value)) return '—';
  const formatter = new Intl.NumberFormat(locale, { maximumFractionDigits: digits });
  const minimum = 10 ** -digits;
  if (digits > 0 && value !== 0 && Math.abs(value) < minimum) {
    return value > 0 ? `<${formatter.format(minimum)}` : `>−${formatter.format(minimum)}`;
  }
  return formatter.format(Object.is(value, -0) ? 0 : value);
}

export function formatMetricBytes(value: unknown, locale: string): string {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) return '—';
  const units = ['B', 'KB', 'MB', 'GB', 'TB', 'PB'];
  const index = value > 0 ? Math.min(units.length - 1, Math.max(0, Math.floor(Math.log(value) / Math.log(1024)))) : 0;
  return `${formatMetric(value / 1024 ** index, locale)} ${units[index]}`;
}
