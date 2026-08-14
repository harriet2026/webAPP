import type { DisplayStatus } from '@/types/email-disposal';
import type { Disposition, RecallStatus } from '@/types/phishing-detection';

/**
 * 邮件状态徽章配色 —— 与「邮件处置中心」共用的唯一色彩来源。
 *
 * 原本是 mail-list-table.tsx 内部未导出的局部常量，现提取到这里，供
 * 「邮件处置中心」和「钓鱼邮件检测智能体 › 检测日志」两处共同引用，
 * 避免同一套状态在两处维护两份配色、产生视觉不一致。
 */
export const DISPLAY_STATUS_VARIANTS: Record<
  DisplayStatus,
  'default' | 'secondary' | 'destructive' | 'outline'
> = {
  rejected: 'destructive',
  discarded: 'outline',
  delivery_cancelled: 'outline',
  quarantine_pending: 'destructive',
  sideline_pending: 'secondary',
  audit_pending: 'secondary',
  delivering: 'secondary',
  delivered: 'default',
  delivery_failed: 'destructive',
  recall_pending: 'secondary',
  recall_success: 'default',
  recall_failed: 'destructive',
  expired: 'outline',
};

/**
 * 旧检测日志数据的兼容映射。新接口应直接返回 display_status，表格会优先使用
 * 后端统一状态；只有历史数据缺失该字段时，才按执行动作给出保守兜底状态。
 */
/**
 * 检测日志「邮件状态」筛选项直接复用处置中心的完整 DisplayStatus 枚举。
 * 这里不维护第二套子集，避免检测日志与处置中心出现状态类型不一致。
 */
export const PHISHING_MAIL_STATUS_OPTIONS: DisplayStatus[] = [
  'delivering',
  'quarantine_pending',
  'sideline_pending',
  'audit_pending',
  'rejected',
  'discarded',
  'delivery_cancelled',
  'delivered',
  'delivery_failed',
  'recall_pending',
  'recall_success',
  'recall_failed',
  'expired',
];

export function mapPhishingDispositionToDisplayStatus(
  disposition: Disposition,
  recallStatus: RecallStatus,
): DisplayStatus {
  switch (recallStatus) {
    case 'pending_processing':
    case 'pending_recall':
      return 'recall_pending';
    case 'recalled':
      return 'recall_success';
    case 'recall_failed':
      return 'recall_failed';
    case 'expanded':
      // 位置维度下"部分召回成功"不再是独立位置节点：邮件仍留在收件箱这个
      // 位置（只是多收件人场景下只召回了一部分），归并到「召回成功」。
      return 'recall_success';
    case 'none':
    default:
      break;
  }

  switch (disposition) {
    case 'quarantine':
      return 'quarantine_pending';
    case 'review':
      return 'audit_pending';
    case 'deliver':
      return 'delivered';
    case 'block':
      return 'rejected';
    case 'drop':
      return 'discarded';
    case 'recall':
      // recallStatus 为 'none' 时命中此分支的边界情况：召回动作已下发但尚未
      // 有具体的召回子状态，保守地视为召回处理中。
      return 'recall_pending';
    default:
      return 'delivering';
  }
}
