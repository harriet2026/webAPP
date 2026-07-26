import type { FinalActionRuleDetail } from '@/types/log';

export type ActionBadgeVariant = 'default' | 'secondary' | 'destructive' | 'outline';

export type KnownAction =
  | 'accept'
  | 'reject'
  | 'quarantine'
  | 'sideline'
  | 'audit'
  | 'discard'
  | 'bounce'
  | 'mixed';

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
    case 'mixed':
      return 'outline';
    default:
      return 'default';
  }
}

// Extra class for the mixed badge — amber so it stands out from neutral outline ones.
export function actionExtraClass(action: string | undefined | null): string {
  if ((action || '').toLowerCase() === 'mixed') {
    return 'border-amber-500 bg-amber-50 text-amber-900 dark:border-amber-400 dark:bg-amber-950/40 dark:text-amber-200';
  }
  return '';
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
