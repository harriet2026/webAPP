import type { DisplayStatus } from '@/types/email-disposal';

export interface PhishingDetailActions {
  /** 未投递态可放行投递 */
  canDeliver: boolean;
  /** 未投递态可丢弃（不再投递） */
  canDrop: boolean;
  /** 已投递态可召回 */
  canRecall: boolean;
}

/**
 * 「邮件状态 → 检测详情面板可执行操作」的判定规则，与「邮件处置中心」批量
 * 工具栏的 canRelease / canRecall（mail-list-table.tsx）同源，也与检测日志
 * 列表（detection-log-table.tsx）此前使用的同一套 display_status 判断保持
 * 一致，避免列表与详情面板对同一状态给出不一致的操作。
 *
 * - quarantine_pending | sideline_pending | audit_pending（隔离中/灰名单中/
 *   待审核，均未投递）→ 可投递或丢弃。
 * - delivered | partial_delivered（已投递/部分投递）→ 唯一有意义的操作是
 *   召回，不能再叫"拦截"（邮件已经送达，拦不住）。
 * - 其余终态（rejected/bounced/discarded/deleted/expired/reviewed_rejected/
 *   delivering/delivery_failed/recall_* 等）→ 无任何可执行操作。
 */
export function getPhishingDetailActions(displayStatus: DisplayStatus): PhishingDetailActions {
  switch (displayStatus) {
    case 'quarantine_pending':
    case 'sideline_pending':
    case 'audit_pending':
      return { canDeliver: true, canDrop: true, canRecall: false };
    case 'delivered':
    case 'partial_delivered':
      return { canDeliver: false, canDrop: false, canRecall: true };
    default:
      return { canDeliver: false, canDrop: false, canRecall: false };
  }
}
