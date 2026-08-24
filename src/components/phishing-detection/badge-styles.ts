import { cn } from '@/lib/utils';
import type { Disposition, PolicyDisposition, RecallStatus, RiskLevel } from '@/types/phishing-detection';

export function dispositionBadgeClass(disposition: Disposition): string {
  switch (disposition) {
    case 'quarantine':
    case 'failed':
      return cn('border-transparent bg-rose-500/15 text-rose-700 dark:text-rose-300');
    case 'audit':
      return cn('border-transparent bg-amber-500/15 text-amber-700 dark:text-amber-300');
    case 'mark':
      return cn('border-transparent bg-sky-500/15 text-sky-700 dark:text-sky-300');
    case 'pass':
      return cn('border-transparent bg-emerald-500/15 text-emerald-700 dark:text-emerald-300');
    case 'pending':
    case 'processing':
    case 'manual_hold':
      return cn('border-transparent bg-muted text-muted-foreground');
    case 'unknown':
      // Explicit `unknown` case (review §5.2) — mail_log missing / unable to
      // determine disposition. Kept muted to distinguish from the live
      // pending/processing/manual_hold states (which share the same palette
      // but convey a different semantic).
      return cn('border-border bg-muted/40 text-muted-foreground italic');
    default:
      return cn('border-border text-muted-foreground');
  }
}

export function riskBadgeClass(risk: RiskLevel | null | undefined): string {
  switch (risk) {
    case 'high':
      return cn('border-transparent bg-rose-500/15 text-rose-700 dark:text-rose-300');
    case 'medium':
      return cn('border-transparent bg-amber-500/15 text-amber-700 dark:text-amber-300');
    case 'low':
      return cn('border-transparent bg-sky-500/15 text-sky-700 dark:text-sky-300');
    case 'suspicious':
      return cn('border-border bg-muted/50 text-muted-foreground');
    default:
      return cn('border-border text-muted-foreground');
  }
}

export function policyDispositionBadgeClass(disposition: PolicyDisposition | null | undefined): string {
  switch (disposition) {
    case 'discard': return 'border-transparent bg-destructive/15 text-destructive';
    case 'quarantine': return 'border-transparent bg-warning/15 text-warning-foreground dark:text-warning';
    case 'audit': return 'border-transparent bg-primary/15 text-primary';
    case 'proceed': return 'border-transparent bg-success/15 text-success-foreground dark:text-success';
    default: return 'border-border bg-muted/40 text-muted-foreground';
  }
}

export function recallBadgeClass(status: RecallStatus): string {
  switch (status) {
    case 'recall_failed':
      return cn('border-transparent bg-rose-500/15 text-rose-700 dark:text-rose-300');
    case 'recalled':
    case 'expanded':
      return cn('border-transparent bg-emerald-500/15 text-emerald-700 dark:text-emerald-300');
    case 'pending_processing':
    case 'pending_recall':
      return cn('border-transparent bg-amber-500/15 text-amber-700 dark:text-amber-300');
    default:
      return cn('border-border text-muted-foreground');
  }
}

export function confidenceClass(confidence?: number | null): string {
  if (confidence === null || confidence === undefined) return '';
  if (confidence >= 0.8) return cn('text-rose-600 dark:text-rose-400 font-semibold');
  if (confidence >= 0.5) return cn('text-amber-600 dark:text-amber-400 font-medium');
  return cn('text-muted-foreground');
}
