import type { ApiRequestFn } from '@/lib/api/client';
import type { DisposalBasis, DisposalListResponse, DisposalMailItem, DisplayStatus, BulkDisposeRequest, BulkDisposeResponse, ParseQueryRequest, ParseQueryResponse, SimilarSearchRequest } from '@/types/email-disposal';
import type { AdvancedFilter, FinalActionRuleDetail } from '@/types/log';
import type { RecipientDisposition } from '@/types/phishing-detection';

export function mapToDisplayStatus(action: string, deliveryStatus?: string, workflowOutcome?: string, recallStatusSummary?: string): DisplayStatus {
  // Recall status takes priority: if the message has any recall record
  // (recall_status_summary is a non-empty, non-'none' value), surface the
  // recall state regardless of the underlying delivery/workflow state.
  if (recallStatusSummary && recallStatusSummary !== 'none' && recallStatusSummary !== '') {
    return recallStatusSummary as DisplayStatus;
  }

  // GT-12353 F5：超时自动放行（timeout_released）与管理员主动批准
  // （approved）在"邮件已经投递出去"这件事上等价，展示态同样按投递状态推导。
  // 此前缺这一支，超时放行的邮件会落到下面 action==='audit' 的分支，
  // 继续显示成「待审核」。
  if (workflowOutcome === 'released' || workflowOutcome === 'approved' || workflowOutcome === 'timeout_released') {
    if (deliveryStatus === 'delivered') return 'delivered';
    if (deliveryStatus === 'in_delivery') return 'delivering';
    if (deliveryStatus === 'failed') return 'delivery_failed';
    if (deliveryStatus === 'partial_delivered') return 'partial_delivered';
    // V2 §三 `delivering`'s trigger condition is delivery_status=unknown/
    // in_delivery — an already-released/approved mail with no terminal
    // delivery status yet is "handed to Postfix, in flight", not a distinct
    // 18th state.
    return 'delivering';
  }
  if (workflowOutcome === 'rejected_after_review') return 'reviewed_rejected';
  if (workflowOutcome === 'discarded') return 'discarded';
  if (workflowOutcome === 'expired') return 'expired';
  if (workflowOutcome === 'deleted') return 'deleted';

  if (action === 'quarantine') return 'quarantine_pending';
  if (action === 'sideline') return 'sideline_pending';
  if (action === 'audit') return 'audit_pending';
  if (action === 'reject') return 'rejected';
  if (action === 'bounce') return 'bounced';
  if (action === 'discard') return 'discarded';

  if (action === 'accept') {
    if (deliveryStatus === 'delivered') return 'delivered';
    if (deliveryStatus === 'in_delivery') return 'delivering';
    if (deliveryStatus === 'partial_delivered') return 'partial_delivered';
    if (deliveryStatus === 'failed') return 'delivery_failed';
    if (deliveryStatus === 'cancelled') return 'discarded';
    return 'delivering';
  }

  // mixed: 收件人被拆分成不同处置（部分投递/部分隔离/部分旁路…）。
  // 执行动作列已用 mini 堆叠色条展示明细，状态列表示整体投递结果。
  // 如果有 delivery_status_summary，优先采用后端值；否则用 partial_delivered。
  if (action === 'mixed') {
    if (deliveryStatus === 'delivered') return 'delivered';
    if (deliveryStatus === 'in_delivery') return 'delivering';
    if (deliveryStatus === 'partial_delivered') return 'partial_delivered';
    if (deliveryStatus === 'failed') return 'delivery_failed';
    return 'partial_delivered';
  }

  return 'delivering';
}

export interface MailLogAPIItem {
  id: number;
  sender: string;
  recipients: string[];
  subject: string;
  action: string;
  status: string;
  // Mail-log API direction: receive / send / internal.  It is computed by
  // the mail-processing pipeline and must not be re-inferred by the UI.
  direction?: string;
  authenticated: boolean;
  smtp_user?: string;
  client_ip?: string;
  queue_id?: string;
  storage_node?: string;
  delivery_status_summary?: string;
  workflow_outcome_summary?: string;
  recall_status_summary?: string;
  reason?: string;
  received_at?: string;
  timestamp?: string;
  email_type?: string;
  email_type_overridden?: boolean;
  email_type_original?: string;
  correction_source?: string;
  // top-level similarity_pct emitted by SimilarItemEntry when returned from /similar endpoints
  similarity_pct?: number;
  disposal_basis?: DisposalBasis;
  disposal_policy_keys?: string;
  /** Per-recipient action details; present when action === 'mixed'. */
  final_action_rule?: Record<string, FinalActionRuleDetail>;
  /** Per-recipient final dispositions; drives the mixed-status stacked bar (方案 C). */
  recipient_dispositions?: RecipientDisposition[];
  /** Distinct actions across all recipients (e.g. ['accept','quarantine']). */
  disposition_actions?: string[];
}

export function mapMailLogToDisposalItem(item: MailLogAPIItem): DisposalMailItem {
  const recipients = item.recipients ?? [];
  // The backend direction carries information that SMTP authentication alone
  // cannot express, such as a trusted relay delivering to a local domain.
  // Keep the authentication-based value only for legacy records that do not
  // return direction at all.
  const directionMap: Record<string, string> = {
    receive: 'incoming',
    send: 'outgoing',
    internal: 'internal',
  };
  const direction = directionMap[item.direction?.toLowerCase() ?? '']
    ?? (item.authenticated || !!item.smtp_user ? 'outgoing' : 'incoming');
  return {
    id: item.id,
    timestamp: item.received_at || item.timestamp || '',
    // Values must match the emailDisposal.filters.* i18n keys the table badge
    // resolves against (incoming/outgoing/internal), not the backend's
    // receive/send vocabulary.
    direction,
    sender: item.sender,
    recipient: recipients[0] || '',
    recipientList: recipients,
    subject: item.subject || '',
    action: item.action,
    status: item.status,
    displayStatus: mapToDisplayStatus(
      item.action,
      item.delivery_status_summary,
      item.workflow_outcome_summary,
      item.recall_status_summary,
    ),
    similarity: item.similarity_pct,
    clientIp: item.client_ip,
    queueId: item.queue_id,
    storageNode: item.storage_node,
    emailType: item.email_type,
    emailTypeOverridden: item.email_type_overridden,
    emailTypeOriginal: item.email_type_original,
    correctionSource: item.correction_source,
    disposalBasis: item.disposal_basis,
    reason: item.reason,
    disposalPolicyKeys: item.disposal_policy_keys,
    finalActionRule: item.final_action_rule,
    recipientDispositions: item.recipient_dispositions,
    dispositionActions: item.disposition_actions,
  };
}

interface MailLogListResponse {
  items: MailLogAPIItem[];
  total: number;
  page: number;
  page_size: number;
  total_pages?: number;
}

// localDayBound 把 yyyy-MM-dd 的"某一天"换算成用户本地时区的日界时刻
// （RFC3339，start=当天 00:00:00.000、end=当天 23:59:59.999），供后端按
// 精确时刻过滤（GT-12633）。非纯日期输入原样透传（后端已接受 RFC3339）。
export function localDayBound(dateOnly: string, endOfDay: boolean): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateOnly)) return dateOnly;
  // 不带时区后缀的字符串会被 Date 按本地时区解析——这正是这里要的语义。
  const dt = new Date(`${dateOnly}T${endOfDay ? '23:59:59.999' : '00:00:00.000'}`);
  if (Number.isNaN(dt.getTime())) return dateOnly;
  return dt.toISOString();
}

export async function getDisposalList(
  params: {
    quick?: Record<string, unknown>;
    advanced?: AdvancedFilter;
    page: number;
    pageSize: number;
    startDate?: string;
    endDate?: string;
    recipient?: string;
    direction?: string;
    displayStatus?: string;
    // Multi-value (spec §3.3.1 / §4.3): serialized as comma-separated
    // email_type=a,b / disposal_policy_keys=IPBL,CR query params.
    emailTypes?: string[];
    disposalPolicyKeys?: string[];
    sortOrder?: 'asc' | 'desc';
  },
  requestFn: ApiRequestFn,
): Promise<DisposalListResponse> {
  const query = new URLSearchParams();
  query.set('page', String(params.page));
  query.set('page_size', String(params.pageSize));
  // GT-12633: 日期筛选按"用户本地时区的当天"换算成带偏移的时刻再发给后端。
  // 后端存储层把纯日期 yyyy-MM-dd 按 UTC 零点解析，UTC+8 用户选的"当天"会
  // 错位 8 小时（当天 00:00-08:00 漏掉、次日 00:00-08:00 混入）。
  if (params.startDate) query.set('start_date', localDayBound(params.startDate, false));
  if (params.endDate) query.set('end_date', localDayBound(params.endDate, true));
  if (params.recipient) query.set('recipient', params.recipient);
  // GT-11614: map quick-filter sendReceiveType to backend direction param.
  // Quick filter values are incoming/outgoing/internal; backend expects
  // receive/send/internal.
  if (params.direction) {
    const dirMap: Record<string, string> = { incoming: 'receive', outgoing: 'send', internal: 'internal' };
    const mapped = dirMap[params.direction] || params.direction;
    query.set('direction', mapped);
  }
  // GT-11618: pass display_status through; backend maps it to action +
  // delivery_status_summary + workflow_outcome_summary predicates.
  if (params.displayStatus) query.set('display_status', params.displayStatus);
  if (params.emailTypes && params.emailTypes.length > 0) query.set('email_type', params.emailTypes.join(','));
  if (params.disposalPolicyKeys && params.disposalPolicyKeys.length > 0) query.set('disposal_policy_keys', params.disposalPolicyKeys.join(','));
  if (params.sortOrder) query.set('sort_order', params.sortOrder);
  if (params.advanced && params.advanced.groups.length > 0) {
    query.set('advanced_filters', JSON.stringify(params.advanced));
  }
  const raw = await requestFn<MailLogListResponse>(`/mail-logs?${query}`);
  return {
    items: (raw.items ?? []).map(mapMailLogToDisposalItem),
    total: raw.total,
    page: raw.page,
    page_size: raw.page_size,
  };
}

export async function parseQuery(
  req: ParseQueryRequest,
  requestFn: ApiRequestFn,
  signal?: AbortSignal,
): Promise<ParseQueryResponse> {
  return requestFn<ParseQueryResponse>('/mail-logs/parse-query', {
    method: 'POST',
    body: req,
    signal,
  });
}

export async function findSimilar(
  req: SimilarSearchRequest,
  requestFn: ApiRequestFn,
): Promise<DisposalListResponse> {
  const raw = await requestFn<MailLogListResponse>('/mail-logs/similar-multi', {
    method: 'POST',
    body: req,
  });
  return {
    items: (raw.items ?? []).map(mapMailLogToDisposalItem),
    total: raw.total,
    page: raw.page ?? 1,
    page_size: raw.page_size ?? raw.total,
  };
}

export async function bulkDispose(
  req: BulkDisposeRequest,
  requestFn: ApiRequestFn,
): Promise<BulkDisposeResponse> {
  return requestFn<BulkDisposeResponse>('/mail-logs/bulk-dispose', {
    method: 'POST',
    body: req,
  });
}

export function getEmlUrl(id: number): string {
  const base = process.env.NEXT_PUBLIC_API_URL || '/api/v1';
  return `${base}/mail-logs/${id}/eml`;
}

export async function resolveDomainTypes(
  domains: string[],
  requestFn: ApiRequestFn,
): Promise<Record<string, string>> {
  if (domains.length === 0) return {};
  const resp = await requestFn<Record<string, string>>(
    `/tenant-domains/_actions/resolve-types?domains=${encodeURIComponent(domains.join(','))}`,
  );
  return resp;
}

export async function recallMails(
  req: {
    mail_log_ids: number[];
    force?: number;
    recall_read?: number;
    recall_unread?: number;
    final_type?: string;
  },
  requestFn: ApiRequestFn,
): Promise<{
  succeeded: number[];
  failed: { id: number; reason: string }[];
  reclassify_failed?: number[];
}> {
  return requestFn('/mail-logs/recall', {
    method: 'POST',
    body: req,
  });
}
