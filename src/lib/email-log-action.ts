import type { FinalActionRuleDetail } from '@/types/log';

export type ActionBadgeVariant = 'default' | 'secondary' | 'destructive' | 'outline';

export type KnownAction =
  | 'accept'
  | 'reject'
  | 'quarantine'
  | 'sideline'
  | 'audit'
  | 'discard'
  | 'bounce';

// Severity order: higher index = more severe. Used to sort multi-action badges.
const ACTION_SEVERITY: Record<string, number> = {
  accept: 0,
  sideline: 1,
  audit: 2,
  quarantine: 3,
  discard: 4,
  bounce: 5,
  reject: 6,
};

export function actionToVariant(action: string | undefined | null): ActionBadgeVariant {
  switch ((action || '').toLowerCase()) {
    case 'accept':
      return 'secondary';
    case 'reject':
    case 'bounce':
    case 'discard':
      return 'destructive';
    case 'quarantine':
    case 'sideline':
    case 'audit':
      return 'outline';
    default:
      return 'default';
  }
}

type ActionTranslator = (key: string) => string;

export function actionLabel(action: string | undefined | null, t: ActionTranslator): string {
  const raw = (action || '').toLowerCase();
  if (!raw) return '-';
  const key = `logs.actionLabels.${raw}`;
  const translated = t(key);
  // next-intl returns the key when missing; fall back to the raw action so
  // unknown values (e.g. from older logs) still render.
  return translated === key ? raw : translated;
}

/** Maximum number of per-action badges shown inline before collapsing with "+N". */
const MAX_INLINE_BADGES = 2;

export interface ActionBadgeEntry {
  action: string;
  /** Number of recipients that received this action (for tooltip). */
  count: number;
}

/**
 * Resolves the list of per-action badges to display for a mail row.
 *
 * - For non-mixed actions, returns a single entry.
 * - For `mixed` actions, de-duplicates by action across all recipients,
 *   sorts by severity (most severe first), and caps at MAX_INLINE_BADGES
 *   with a remainder count for "+N" display.
 */
export function resolveActionBadges(
  action: string,
  finalActionRule?: Record<string, FinalActionRuleDetail>,
): { badges: ActionBadgeEntry[]; remainder: number } {
  const raw = (action || '').toLowerCase();

  if (raw !== 'mixed' || !finalActionRule) {
    return { badges: raw ? [{ action: raw, count: 1 }] : [], remainder: 0 };
  }

  // Aggregate counts per action across all recipients.
  const counts = new Map<string, number>();
  for (const detail of Object.values(finalActionRule)) {
    const a = (detail?.action || '').toLowerCase();
    if (!a) continue;
    counts.set(a, (counts.get(a) || 0) + 1);
  }

  const sorted = Array.from(counts.entries())
    .map(([a, count]) => ({ action: a, count }))
    .sort((a, b) => {
      const sa = ACTION_SEVERITY[a.action] ?? -1;
      const sb = ACTION_SEVERITY[b.action] ?? -1;
      // Most severe first; tie-break alphabetically.
      return sb - sa || a.action.localeCompare(b.action);
    });

  const badges = sorted.slice(0, MAX_INLINE_BADGES);
  const remainder = sorted.length - badges.length;
  return { badges, remainder };
}

export interface FinalActionSummaryEntry {
  action: string;
  count: number;
}

export function summarizeFinalActions(
  finalActionRule: Record<string, FinalActionRuleDetail> | undefined,
): FinalActionSummaryEntry[] {
  if (!finalActionRule) return [];
  const counts = new Map<string, number>();
  for (const detail of Object.values(finalActionRule)) {
    const a = (detail?.action || '').toLowerCase();
    if (!a) continue;
    counts.set(a, (counts.get(a) || 0) + 1);
  }
  return Array.from(counts.entries())
    .map(([action, count]) => ({ action, count }))
    .sort((a, b) => b.count - a.count || a.action.localeCompare(b.action));
}

export function formatRcptActionList(
  finalActionRule: Record<string, FinalActionRuleDetail> | undefined,
  t: ActionTranslator,
): string {
  if (!finalActionRule) return '';
  return Object.entries(finalActionRule)
    .map(([rcpt, d]) => `${rcpt || 'global'}: ${actionLabel(d.action, t)}`)
    .join('\n');
}
