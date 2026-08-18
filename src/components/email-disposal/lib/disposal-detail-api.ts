import { toast } from 'sonner';
import type { ApiRequestFn } from '@/lib/api/client';
import { API_BASE } from '@/lib/api/client';
import { getTenantHeader } from '@/lib/api/logs';
import { createUnifiedRule } from '@/lib/api/unified-rules';
import { bulkDispose } from './disposal-api';
import type { CheckStatus, FinalVerdict, MailLogDetail, MailLogAnalysis, MailChildEvent, MailLifecycleLogsResponse, ObjectDisposeResult } from '@/types/email-disposal-detail';
import type { BulkDisposeResponse } from '@/types/email-disposal';
import type { EmailPreviewResponse } from '@/types/email-preview';

export async function getMailLogDetail(id: number, requestFn: ApiRequestFn): Promise<MailLogDetail> {
  return requestFn<MailLogDetail>(`/mail-logs/${id}`);
}

export async function getMailLogAnalysis(id: number, recipient: string | undefined, requestFn: ApiRequestFn): Promise<MailLogAnalysis> {
  const query = recipient ? `?recipient=${encodeURIComponent(recipient)}` : '';
  const response = await requestFn<MailLogAnalysisWire>(`/mail-logs/${id}/analysis${query}`);

  // The API follows the repository-wide snake_case JSON convention, while
  // DetectionStage is a view model shared by the pipeline renderer. Normalize
  // once at this boundary so components cannot accidentally read undefined
  // durationMs/ruleIds fields from the wire payload.
  return {
    scope: response.scope,
    recipient: response.recipient,
    action: response.action,
    status: response.status,
    final_verdict: response.final_verdict,
    total_elapsed_ms: response.total_elapsed_ms,
    stages: response.stages.map((stage) => ({
      stage: stage.stage,
      key: stage.key,
      status: stage.status,
      durationMs: stage.duration_ms,
      checks: stage.checks.map((check) => ({
        key: check.key,
        status: check.status,
        ruleIds: check.rule_ids,
        recipientGroups: check.recipient_groups?.map((group) => ({
          recipients: group.recipients,
          status: group.status,
          ruleIds: group.rule_ids,
        })),
      })),
    })),
  };
}

interface MailLogAnalysisWire {
  scope: 'all' | 'recipient';
  recipient?: string;
  action?: string;
  status?: string;
  final_verdict: FinalVerdict;
  total_elapsed_ms: number;
  stages: Array<{
    stage: number;
    key: string;
    status: CheckStatus;
    duration_ms?: number;
    checks: Array<{
      key: string;
      status: CheckStatus;
      rule_ids: number[];
      recipient_groups?: Array<{
        recipients: string[];
        status: CheckStatus;
        rule_ids: number[];
      }>;
    }>;
  }>;
}

// downloadEml fetches the raw .eml for a mail log and triggers a browser
// download. Lifted out of overview-section.tsx (task 7) so both the
// overview module's own "下载原文" button and ThreatSummaryCard's E7 "更多 →
// 导出EML" menu item (SenderActions' onExportEml) share one fetch/blob
// implementation instead of duplicating it -- see sender-actions.tsx's
// onExportEml doc comment. `t` must be an `emailDisposal.detail.overview`
// scoped translator (needs `downloadFailed`/`downloadNotFound`).
export async function downloadEml(mailLogId: number, t: (key: string) => string): Promise<void> {
  try {
    const resp = await fetch(`${API_BASE}/mail-logs/${mailLogId}/eml`, {
      credentials: 'include',
      headers: { ...getTenantHeader() },
    });
    if (!resp.ok) {
      // GT-11568: surface the real reason (404 not stored / 403 tenant
      // scope / 5xx storage node down) so the user knows whether the EML
      // was never stored, deleted, or temporarily unreachable.
      let reason = t('downloadFailed');
      try {
        const errBody = await resp.json();
        const apiErr = errBody?.error;
        if (typeof apiErr === 'string') {
          reason = apiErr;
        } else if (apiErr?.message) {
          reason = apiErr.message;
        } else if (apiErr?.code === 'not_found') {
          reason = t('downloadNotFound');
        }
      } catch {
        /* response body wasn't JSON — fall back to generic message */
      }
      toast.error(reason);
      return;
    }
    const blob = await resp.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `mail-${mailLogId}.eml`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  } catch {
    toast.error(t('downloadFailed'));
  }
}

// downloadAttachment -- GT-12584：详情页附件卡片「下载」按钮的真实实现，
// 打后端 GET /mail-logs/{id}/attachments/{md5}（按内容 MD5 从原始 EML 提取
// 单个附件）。错误展示逻辑与 downloadEml 同款：优先透出后端 error 文案
// （404 未存原文 / 403 越权 / 500 存储节点故障），否则回退通用失败文案。
// `t` 与 downloadEml 一致，是 `emailDisposal.detail.overview` 作用域的
// translator（需要 downloadFailed/downloadNotFound）。
export async function downloadAttachment(mailLogId: number, attachment: { md5sum?: string; filename?: string }, t: (key: string) => string): Promise<void> {
  if (!attachment.md5sum) {
    toast.error(t('downloadFailed'));
    return;
  }
  try {
    const resp = await fetch(`${API_BASE}/mail-logs/${mailLogId}/attachments/${encodeURIComponent(attachment.md5sum)}`, { credentials: 'include', headers: { ...getTenantHeader() } });
    if (!resp.ok) {
      let reason = t('downloadFailed');
      try {
        const errBody = await resp.json();
        const apiErr = errBody?.error;
        if (typeof apiErr === 'string') {
          reason = apiErr;
        } else if (apiErr?.message) {
          reason = apiErr.message;
        } else if (apiErr?.code === 'not_found') {
          reason = t('downloadNotFound');
        }
      } catch {
        /* response body wasn't JSON — fall back to generic message */
      }
      toast.error(reason);
      return;
    }
    const blob = await resp.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = attachment.filename || `attachment-${attachment.md5sum}`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  } catch {
    toast.error(t('downloadFailed'));
  }
}

export async function getMailLogPreview(id: number, requestFn: ApiRequestFn): Promise<EmailPreviewResponse> {
  return requestFn<EmailPreviewResponse>(`/mail-logs/${id}/preview`);
}

export async function getMailLogEvents(id: number, requestFn: ApiRequestFn): Promise<MailChildEvent[]> {
  const resp = await requestFn<{ items: MailChildEvent[] }>(`/mail-logs/${id}/events?page=1&page_size=100`);
  return resp.items ?? [];
}

export async function getMailLifecycleLogs(id: number, requestFn: ApiRequestFn, signal?: AbortSignal): Promise<MailLifecycleLogsResponse> {
  const resp = await requestFn<MailLifecycleLogsResponse>(`/mail-logs/${id}/lifecycle-logs`, { signal });
  return {
    items: resp.items ?? [],
    total: resp.total ?? 0,
    truncated: resp.truncated ?? false,
    partial: resp.partial ?? false,
    searched_nodes: resp.searched_nodes ?? [],
    failed_nodes: resp.failed_nodes ?? [],
  };
}

export async function disposeOne(id: number, action: 'release' | 'delete', requestFn: ApiRequestFn): Promise<BulkDisposeResponse> {
  return bulkDispose({ mail_log_ids: [id], action }, requestFn);
}

export async function disposeByObject(
  mailLogId: number,
  objectId: string,
  action: 'release' | 'delete',
  finalType: string | undefined,
  requestFn: ApiRequestFn,
): Promise<{ results: ObjectDisposeResult[] }> {
  return requestFn<{ results: ObjectDisposeResult[] }>('/mail-logs/bulk-dispose', {
    method: 'POST',
    body: {
      action,
      mail_log_ids: [mailLogId],
      object_id: objectId,
      ...(finalType ? { final_type: finalType } : {}),
    },
  });
}

// disposeObjectAction -- demo-parity 隔离/阻断 (task RA-5). The real backend's
// BulkDisposeMailLogs only accepts action=release|delete (internal/api/
// mail_log_disposal.go: `if req.Action != "release" && req.Action != "delete"`
// -> 400 "action must be release or delete"), so this deliberately posts a
// non-conforming action value and lets the two environments diverge on their
// own: the mock dispatcher (src/lib/mock/dispatcher.ts + fixtures.ts)
// recognizes 'quarantine'/'block' and mutates the recipient's disposition
// state like the demo does; the real backend's 400 propagates as a thrown
// ApiError that the caller (useRecipientDisposition's
// dispatchQuarantineOrBlock) turns into a "隔离/阻断 操作后端暂未支持" toast.
// No explicit mock-vs-real branching needed here -- the backend's own
// validation IS the detection mechanism.
export async function disposeObjectAction(mailLogId: number, objectId: string, action: 'quarantine' | 'block', requestFn: ApiRequestFn): Promise<{ results: ObjectDisposeResult[] }> {
  return requestFn<{ results: ObjectDisposeResult[] }>('/mail-logs/bulk-dispose', {
    method: 'POST',
    body: {
      action,
      mail_log_ids: [mailLogId],
      object_id: objectId,
    },
  });
}

// GT-12880：重新投递（门槛=原文还在保留期内；后端 404 original_expired /
// 409 in_progress / 400 recipient_deferred 经 apiErrors.redeliver.* 本地化）。
export async function redeliverMail(mailLogId: number, recipients: string[], requestFn: ApiRequestFn): Promise<{ queue_id?: string }> {
  return (await requestFn(`/mail-logs/${mailLogId}/redeliver`, {
    method: 'POST',
    body: { recipients },
  })) as { queue_id?: string };
}

export async function notifyRecipient(mailLogId: number, recipient: string, requestFn: ApiRequestFn): Promise<void> {
  await requestFn(`/mail-logs/${mailLogId}/notify`, {
    method: 'POST',
    body: { recipient },
  });
}

export interface AddSenderFilterRuleOptions {
  // 'tenant' (default, unchanged from pre-existing behavior) omits tenant_id
  // entirely and lets the backend resolve ownership from the caller's
  // effective tenant context (X-Tenant-ID header / JWT tenant claim -- see
  // createRuleTenantID in internal/api/unified_rules.go).
  //
  // 'global' explicitly sends tenant_id: null. CAVEAT (read before assuming
  // this always yields a platform-wide rule): CreateRuleRequest.tenant_id is
  // a Go `*int` with `json:"tenant_id,omitempty"`, so a JSON `null` is
  // indistinguishable on the wire from an omitted key -- the backend falls
  // through to the SAME effective-tenant-context resolution as the 'tenant'
  // case. It only actually produces tenant_id=NULL (global) when the caller
  // has no active tenant-impersonation context (system_admin with no tenant
  // selected). If this dialog is opened while managing/impersonating a
  // specific tenant (the common case for a mail-log drill-down, since a mail
  // log always belongs to one tenant), selecting 'global' silently resolves
  // to that same tenant -- never broader than intended, but not the
  // platform-wide rule the admin asked for. Separately, a tenant_admin
  // caller can NEVER create a global rule regardless of this field: the
  // backend fail-closed guard always forces tenantID to their own tenant for
  // that role. `metadata.scope` is still stamped for auditability/display
  // even when the tenant_id itself doesn't achieve full global reach.
  scope?: 'tenant' | 'global';
  // Only meaningful for kind='blacklist' (E1's "同时拦截该域名下所有地址"
  // checkbox; E2/whitelist has no such option). Switches the match from an
  // exact sender-address `eq` to a `sender suffix "@<domain>"` condition --
  // the same idiom already used elsewhere in this codebase for "block every
  // address at a domain" (see internal/api/advanced_rules_keywords_test.go's
  // `from_address suffix "@evil.com"`). This blocks every local-part at that
  // exact domain; it does NOT do true subdomain-suffix matching (a stricter
  // `senderdomain suffix "<domain>"` condition would also catch
  // sub.domain.com but risks false-suffix collisions like
  // "notdomain.com".endsWith("domain.com")) -- chosen to match the dialog's
  // literal Chinese copy ("该域名下所有地址") exactly.
  includeSubdomains?: boolean;
}

// GT-12628 真实数据验证发现：此处硬编码 priority 5000 会让租户管理员创建
// 一律 400（后端 validatePriority 对 tenant_admin 强制 100-1000，实测
// "tenant admin priority must be between 100 and 1000"）——与 GT-12601 修过
// 的 addUrlRule/addAttachmentHashRule 同族，发信人路径当时被漏掉。priority
// 由调用方经 disposalRulePriority(isSystemAdmin) 按角色传入。
export async function addSenderFilterRule(sender: string, kind: 'whitelist' | 'blacklist', requestFn: ApiRequestFn, priority: number, opts?: AddSenderFilterRuleOptions): Promise<void> {
  const domain = sender.includes('@') ? sender.slice(sender.indexOf('@') + 1) : sender;
  const conditionTree =
    opts?.includeSubdomains && kind === 'blacklist'
      ? {
          type: 'condition' as const,
          field: 'sender',
          operator: 'suffix',
          value: `@${domain}`,
        }
      : {
          type: 'condition' as const,
          field: 'sender',
          operator: 'eq',
          value: sender,
        };

  await createUnifiedRule(
    {
      // GT-12607：生成规则名用中文前缀（本产品面向中文管理员；名称是落库数据，
      // 不走 i18n 运行时字典）。
      name: `${kind === 'whitelist' ? '发信人加白' : '发信人加黑'} ${sender}`,
      page: 'sender_filter',
      rule_class: 'action',
      stage: 'rcpt',
      action: kind === 'whitelist' ? 'accept' : 'reject',
      priority,
      condition_tree: conditionTree,
      metadata: opts?.scope ? { feature: 'sender_filter', scope: opts.scope } : { feature: 'sender_filter' },
      is_active: true,
      ...(opts?.scope === 'global' ? { tenant_id: null } : {}),
    },
    requestFn,
  );
}

// disposalRulePriority -- GT-12601：后端 validatePriority（internal/api/
// unified_rules.go）对 tenant_admin 强制 100-1000 区间，此前这里硬编码 5000
// 导致租户管理员从详情页做域名/URL/哈希加黑一律 400（"tenant admin priority
// must be between 100 and 1000"），前端只显示一句「加黑失败」。取值随角色：
// 租户管理员用区间顶格 1000（数值越大越优先，保住"应急加黑优先生效"的语义），
// 平台管理员维持既有 5000 不变。与 GT-12181（advanced-filter-rules 的
// priority-range.ts）同一后端约束、同一处理思路。
export function disposalRulePriority(isSystemAdmin: boolean): number {
  return isSystemAdmin ? 5000 : 1000;
}

export type MailLogBlacklistEntityKind = 'domain' | 'url' | 'attachment_hash';

// The detail page sends only the operator's intent. The backend owns tenant,
// direction, priority, stage, exact matching semantics and the quarantine
// action, and verifies that the value is actually present in this mail log.
export async function blacklistMailLogEntity(mailLogId: number, kind: MailLogBlacklistEntityKind, value: string, requestFn: ApiRequestFn): Promise<void> {
  await requestFn(`/mail-logs/${mailLogId}/blacklist`, {
    method: 'POST',
    body: { kind, value },
  });
}
