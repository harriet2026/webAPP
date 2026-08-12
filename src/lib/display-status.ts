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
  bounced: 'destructive',
  discarded: 'outline',
  quarantine_pending: 'destructive',
  sideline_pending: 'secondary',
  audit_pending: 'secondary',
  delivering: 'secondary',
  delivered: 'default',
  partial_delivered: 'secondary',
  delivery_failed: 'destructive',
  recall_pending: 'secondary',
  recall_success: 'default',
  recall_failed: 'destructive',
  partial_recall_success: 'secondary',
  deleted: 'outline',
  expired: 'outline',
  reviewed_rejected: 'destructive',
};

/**
 * 将「钓鱼邮件检测智能体 › 检测日志」自身的 disposition（执行动作）+
 * recall_status（召回/通知状态）派生为「邮件处置中心」权威的 DisplayStatus。
 *
 * 检测日志接口目前没有独立的邮件生命周期状态字段，只有 disposition 和
 * recall_status 两个字段，因此需要在前端派生展示——但派生规则镜像
 * `disposal-api.ts` 里 mapToDisplayStatus() 的「召回优先」原则，保证同一封
 * 邮件无论在哪个模块查看，「邮件状态」语义都一致。
 *
 * 映射依据（如后续与后端真实口径不符，可在此集中调整，不影响调用侧）：
 * 1. recall_status 非 'none' 时优先展示召回态，因为召回动作发生在初始处置
 *    之后，代表邮件当前更新的实际状态：
 *    - pending_processing / pending_recall → recall_pending（召回中）
 *    - recalled                              → recall_success（召回成功）
 *    - recall_failed                         → recall_failed（召回失败）
 *    - expanded（部分收件人召回）             → partial_recall_success（部分召回成功）
 * 2. 否则按 disposition 落到处置中心同语义的状态：
 *    - quarantine  → quarantine_pending（隔离中）——已被隔离、等待人工放行/删除
 *    - audit / manual_hold → audit_pending（待审核）——人工暂扣本质也是等待人工复核
 *    - pass / mark → delivered（投递成功）——放行与仅标记均代表邮件已正常送达
 *    - failed      → delivery_failed（投递失败）
 *    - pending / processing / unknown → delivering（投递中）——尚未产出最终结论，
 *      与处置中心的默认兜底分支一致
 */
/**
 * 检测日志「邮件状态」筛选项直接复用处置中心的完整 DisplayStatus 枚举。
 * 这里不维护第二套子集，避免检测日志与处置中心出现状态类型不一致。
 */
export const PHISHING_MAIL_STATUS_OPTIONS: DisplayStatus[] = [
  'rejected',
  'bounced',
  'discarded',
  'quarantine_pending',
  'sideline_pending',
  'audit_pending',
  'delivering',
  'delivered',
  'partial_delivered',
  'delivery_failed',
  'recall_pending',
  'recall_success',
  'recall_failed',
  'partial_recall_success',
  'deleted',
  'expired',
  'reviewed_rejected',
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
      return 'partial_recall_success';
    case 'none':
    default:
      break;
  }

  switch (disposition) {
    case 'quarantine':
      return 'quarantine_pending';
    case 'audit':
    case 'manual_hold':
      return 'audit_pending';
    case 'pass':
    case 'mark':
      return 'delivered';
    case 'failed':
      return 'delivery_failed';
    case 'pending':
    case 'processing':
    case 'unknown':
    default:
      return 'delivering';
  }
}
