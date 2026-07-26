import { cn } from '@/lib/utils';
import type { LeakDisposition, RecallStatus, RiskLevel, RunStatus, ThreatType } from '@/types/threat-retro';

export function recallBadgeClass(s: RecallStatus | string): string {
  switch (s) {
    case 'recalled':
    case '已召回':
      return cn('border-transparent bg-emerald-500/15 text-emerald-700 dark:text-emerald-300');
    case 'pending_recall':
    case '召回中':
      return cn('border-transparent bg-amber-500/15 text-amber-700 dark:text-amber-300');
    case 'recall_failed':
      return cn('border-transparent bg-rose-500/15 text-rose-700 dark:text-rose-300');
    default:
      return cn('border-border text-muted-foreground');
  }
}

export function runStatusBadgeClass(s: RunStatus | string): string {
  switch (s) {
    case 'pending':
    case '等待中':
      return cn('border-transparent bg-amber-500/15 text-amber-700 dark:text-amber-300');
    case 'running':
    case '进行中':
      return cn('border-transparent bg-sky-500/15 text-sky-700 dark:text-sky-300');
    case 'completed':
    case '已完成':
      return cn('border-transparent bg-emerald-500/15 text-emerald-700 dark:text-emerald-300');
    case 'failed':
    case '失败':
      return cn('border-transparent bg-rose-500/15 text-rose-700 dark:text-rose-300');
    case 'cancelled':
    case '已取消':
      return cn('border-transparent bg-muted text-muted-foreground');
    default:
      return cn('border-border text-muted-foreground');
  }
}

export function dispositionBadgeClass(d: LeakDisposition | string): string {
  switch (d) {
    case 'pending_recall':
      return cn('border-transparent bg-amber-500/15 text-amber-700 dark:text-amber-300');
    case 'recalled':
      return cn('border-transparent bg-emerald-500/15 text-emerald-700 dark:text-emerald-300');
    case 'alert_only':
      return cn('border-transparent bg-sky-500/15 text-sky-700 dark:text-sky-300');
    case 'false_positive':
      return cn('border-transparent bg-muted text-muted-foreground');
    default:
      return cn('border-border text-muted-foreground');
  }
}

export function threatTypeBadgeClass(t: ThreatType | string): string {
  switch (t) {
    case 'phishing':
      return cn('border-transparent bg-rose-500/15 text-rose-700 dark:text-rose-300');
    case 'malware':
      return cn('border-transparent bg-orange-500/15 text-orange-700 dark:text-orange-300');
    case 'impersonation':
      return cn('border-transparent bg-violet-500/15 text-violet-700 dark:text-violet-300');
    default:
      return cn('border-border text-muted-foreground');
  }
}

// confidence is 0-100 in the run read model.
export function confidenceClass(n: number): string {
  if (n >= 90) return cn('text-rose-600 dark:text-rose-400 font-semibold');
  if (n >= 70) return cn('text-amber-600 dark:text-amber-400 font-medium');
  return cn('text-emerald-600 dark:text-emerald-400');
}

export function riskOf(n: number): RiskLevel {
  return n >= 90 ? 'high' : n >= 70 ? 'medium' : 'low';
}
