import { format, isValid, parseISO } from 'date-fns';

/**
 * Convert values produced by browser date/datetime-local inputs to RFC3339.
 * Go's encoding/json unmarshals time.Time only from RFC3339, whereas these
 * controls produce date-only or local-time strings without a zone.
 */
export function toRFC3339(value: string | null | undefined): string | undefined {
  if (!value) return undefined;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
}

/**
 * Format an ISO 8601 timestamp to a user-friendly local-time string
 * "YYYY-MM-DD HH:mm:ss".
 *
 * GT-11971: 个人中心 时间戳（最近登录时间 / 登录历史 / 登录会话）此前原样渲染
 * ISO 8601（如 "2026-07-09T01:40:10.891005Z"），现统一格式化为本地时间。
 *
 * Returns '' for null / empty / unparseable input so callers can fall back to
 * their own placeholder (e.g. '—'). Locale-neutral numeric format, valid for
 * all UI languages.
 */
export function formatTimestamp(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = parseISO(iso);
  return isValid(d) ? format(d, 'yyyy-MM-dd HH:mm:ss') : '';
}
