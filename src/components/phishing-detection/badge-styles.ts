import { cn } from '@/lib/utils';
import type { Disposition, RecallStatus, RiskLevel } from '@/types/phishing-detection';

export function normalizePhishingRiskLevel(risk: string | null | undefined): RiskLevel {
  switch (risk) {
    case 'critical':
      return 'high';
    case 'low':
      return 'low';
    case 'medium':
      return 'medium';
    case 'high':
      return 'high';
    case 'suspicious':
    case 'none':
    default:
      return 'suspicious';
  }
}

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

export function riskBadgeClass(risk: string | null | undefined): string {
  const normalized = normalizePhishingRiskLevel(risk);
  switch (normalized) {
    case 'high':
      return cn('border-transparent bg-rose-500/15 text-rose-700 dark:text-rose-300');
    case 'medium':
      return cn('border-transparent bg-amber-500/15 text-amber-700 dark:text-amber-300');
    case 'low':
      return cn('border-transparent bg-sky-500/15 text-sky-700 dark:text-sky-300');
    default:
      return cn('border-transparent bg-emerald-500/15 text-emerald-700 dark:text-emerald-300');
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

// ─── 置信度分级处置策略：区间风险等级 ────────────────────────────────────
// 与上面的 RiskLevel（检测结果的研判风险）是两个不同的领域概念：这里描述的
// 是"置信度分级处置策略"表格里每一档区间本身的风险严重度（可疑/低危/中危/
// 高危），用于给运营人员一个直观的颜色提示。目前 bands 固定 4 段、按置信度
// 升序排列（UI 未提供新增/删除行），因此按位置派生即可，无需在 PhishBand
// 上新增字段——若未来分级数量或顺序规则发生变化，需同步调整这里的映射。
export type BandRiskLevel = 'suspicious' | 'low' | 'medium' | 'high';

export function bandRiskLevelForIndex(index: number, total: number): BandRiskLevel {
  if (total <= 1) return 'high';
  const ratio = index / (total - 1);
  if (ratio >= 1) return 'high';
  if (ratio >= 2 / 3) return 'medium';
  if (ratio >= 1 / 3) return 'low';
  return 'suspicious';
}

export function bandRiskLevelBadgeClass(level: BandRiskLevel): string {
  switch (level) {
    case 'high':
      return cn('border-transparent bg-rose-500/15 text-rose-700 dark:text-rose-300');
    case 'medium':
      return cn('border-transparent bg-amber-500/15 text-amber-700 dark:text-amber-300');
    case 'low':
      return cn('border-transparent bg-sky-500/15 text-sky-700 dark:text-sky-300');
    default:
      return cn('border-transparent bg-muted text-muted-foreground');
  }
}

export function confidenceClass(confidence?: number | null): string {
  if (confidence === null || confidence === undefined) return '';
  if (confidence >= 0.8) return cn('text-rose-600 dark:text-rose-400 font-semibold');
  if (confidence >= 0.5) return cn('text-amber-600 dark:text-amber-400 font-medium');
  return cn('text-muted-foreground');
}
