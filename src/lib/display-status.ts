import type { DisplayStatus } from '@/types/email-disposal';

/**
 * GT-12955 的邮件状态 Badge 配色唯一事实源。
 * 处置中心主列表与相似邮件列表共用，避免新增/归并状态时漂移。
 */
export const DISPLAY_STATUS_VARIANTS: Record<
  DisplayStatus,
  'default' | 'secondary' | 'destructive' | 'outline'
> = {
  delivering: 'secondary',
  quarantine_pending: 'destructive',
  sideline_pending: 'secondary',
  audit_pending: 'secondary',
  rejected: 'destructive',
  discarded: 'outline',
  delivery_cancelled: 'outline',
  delivered: 'default',
  delivery_failed: 'destructive',
  recall_pending: 'secondary',
  recall_success: 'default',
  recall_failed: 'destructive',
  expired: 'outline',
};

const CURRENT_DISPLAY_STATUSES = new Set<DisplayStatus>(
  Object.keys(DISPLAY_STATUS_VARIANTS) as DisplayStatus[],
);

/**
 * 升级前保存的 display_status 条件仍由后端按原集合执行，但 API 响应只会下发
 * GT-12955 的 13 个规范状态。这里仅把“筛选值”换成可用于主 Badge 联动的规范
 * key，不从邮件原始字段推导状态，因此不会形成第二套展示事实源。
 *
 * pending_review 在这里是旧的顶层筛选别名（历史语义=检测中）；它与收件人原始
 * status=pending_review（后端归一为 audit_pending）是两个不同字段域。
 */
const LEGACY_FILTER_HIGHLIGHTS: Record<string, DisplayStatus[]> = {
  quarantined: ['quarantine_pending'],
  pending_review: ['sideline_pending'],
  blocked: ['rejected'],
  bounced: ['delivery_failed'],
  partial_delivered: ['delivered', 'delivery_failed'],
  partial_recall_success: ['recall_success', 'recall_failed'],
  deleted: ['discarded'],
  reviewed_rejected: ['discarded'],
};

export function resolveDisplayStatusHighlightKeys(
  values: Iterable<string>,
): DisplayStatus[] {
  const result = new Set<DisplayStatus>();
  for (const value of values) {
    if (CURRENT_DISPLAY_STATUSES.has(value as DisplayStatus)) {
      result.add(value as DisplayStatus);
      continue;
    }
    for (const status of LEGACY_FILTER_HIGHLIGHTS[value] ?? []) {
      result.add(status);
    }
  }
  return [...result];
}
