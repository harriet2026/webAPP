import { toast } from 'sonner';
import type { ApiRequestFn } from '@/lib/api/client';
import { API_BASE } from '@/lib/api/client';
import { getTenantHeader } from '@/lib/api/logs';
import { createUnifiedRule } from '@/lib/api/unified-rules';
import { bulkDispose } from './disposal-api';
import type { MailLogDetail, MailChildEvent, ObjectDisposeResult } from '@/types/email-disposal-detail';
import type { BulkDisposeResponse } from '@/types/email-disposal';
import type { EmailPreviewResponse } from '@/types/email-preview';

export async function getMailLogDetail(
  id: number,
  requestFn: ApiRequestFn,
): Promise<MailLogDetail> {
  return requestFn<MailLogDetail>(`/mail-logs/${id}`);
}

// downloadEml fetches the raw .eml for a mail log and triggers a browser
// download. Lifted out of overview-section.tsx (task 7) so both the
// overview module's own "下载原文" button and ThreatSummaryCard's E7 "更多 →
// 导出EML" menu item (SenderActions' onExportEml) share one fetch/blob
// implementation instead of duplicating it -- see sender-actions.tsx's
// onExportEml doc comment. `t` must be an `emailDisposal.detail.overview`
// scoped translator (needs `downloadFailed`/`downloadNotFound`).
export async function downloadEml(
  mailLogId: number,
  t: (key: string) => string,
): Promise<void> {
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
export async function downloadAttachment(
  mailLogId: number,
  attachment: { md5sum?: string; filename?: string },
  t: (key: string) => string,
): Promise<void> {
  if (!attachment.md5sum) {
    toast.error(t('downloadFailed'));
    return;
  }
  try {
    const resp = await fetch(
      `${API_BASE}/mail-logs/${mailLogId}/attachments/${encodeURIComponent(attachment.md5sum)}`,
      { credentials: 'include', headers: { ...getTenantHeader() } },
    );
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

export async function getMailLogPreview(
  id: number,
  requestFn: ApiRequestFn,
): Promise<EmailPreviewResponse> {
  return requestFn<EmailPreviewResponse>(`/mail-logs/${id}/preview`);
}

export async function getMailLogEvents(
  id: number,
  requestFn: ApiRequestFn,
): Promise<MailChildEvent[]> {
  const resp = await requestFn<{ items: MailChildEvent[] }>(
    `/mail-logs/${id}/events?page=1&page_size=100`,
  );
  return resp.items ?? [];
}

export async function disposeOne(
  id: number,
  action: 'release' | 'delete',
  requestFn: ApiRequestFn,
): Promise<BulkDisposeResponse> {
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
export async function disposeObjectAction(
  mailLogId: number,
  objectId: string,
  action: 'quarantine' | 'block',
  requestFn: ApiRequestFn,
): Promise<{ results: ObjectDisposeResult[] }> {
  return requestFn<{ results: ObjectDisposeResult[] }>('/mail-logs/bulk-dispose', {
    method: 'POST',
    body: {
      action,
      mail_log_ids: [mailLogId],
      object_id: objectId,
    },
  });
}

export async function notifyRecipient(
  mailLogId: number,
  recipient: string,
  requestFn: ApiRequestFn,
): Promise<void> {
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

export async function addSenderFilterRule(
  sender: string,
  kind: 'whitelist' | 'blacklist',
  requestFn: ApiRequestFn,
  opts?: AddSenderFilterRuleOptions,
): Promise<void> {
  const domain = sender.includes('@') ? sender.slice(sender.indexOf('@') + 1) : sender;
  const conditionTree = opts?.includeSubdomains && kind === 'blacklist'
    ? { type: 'condition' as const, field: 'sender', operator: 'suffix', value: `@${domain}` }
    : { type: 'condition' as const, field: 'sender', operator: 'eq', value: sender };

  await createUnifiedRule(
    {
      name: `${kind === 'whitelist' ? 'Whitelist' : 'Blacklist'} ${sender}`,
      page: 'sender_filter',
      rule_class: 'action',
      stage: 'rcpt',
      action: kind === 'whitelist' ? 'accept' : 'reject',
      priority: 5000,
      condition_tree: conditionTree,
      metadata: opts?.scope ? { feature: 'sender_filter', scope: opts.scope } : { feature: 'sender_filter' },
      is_active: true,
      ...(opts?.scope === 'global' ? { tenant_id: null } : {}),
    },
    requestFn,
  );
}

// addUrlRule / addAttachmentHashRule -- EntityDetection (C6/C7) 的域名/URL/
// 哈希加黑，同样复用统一规则系统的 createUnifiedRule（不新增动作类型，一律
// action='reject'）。
//
// 字段映射说明（task-9：已核对 internal/api/field_registry.go +
// internal/antispam/rule_eval.go，不是照抄 brief 里假设的字面字段名）：
//
// - url_protection：evalCtx 里**没有**独立的 "domain" / "url" 字段——milter.go
//   在 DATA 阶段把解析出的全部 URL 逗号拼接写入 ctx["urls"]（rule_eval.go 的
//   stringFields 表 + internal/api/field_registry.go 的 "urls" 条目，
//   MinStage="data"，无 Pages 限制）。webapp 自己的 54-条件目录
//   （advanced-filter-rules/catalogue.ts）里 'url' 和 'urlDomain' 两个目录项
//   也都回落到同一个 field:'urls'（RuleNode.note 字段的注释原话就是
//   "urls ← url/urlDomain"），用 text 面板做子串匹配。因此域名加黑和 URL加黑
//   都落在同一个 field='urls'、operator='contain'（rule_eval.go 的真实算子
//   token 是 "contain"，不是 brief 里写的 "contains" —— 那是另一套系统
//   MailLogFieldRegistry/SearchOperator 的词汇表，与统一规则条件树算子不是
//   同一套），差异只在 value：域名加黑传 domain（子串匹配命中该域名下任意
//   URL），URL加黑传完整 url（子串匹配命中这一条 URL）。
// - attachment_security：sideline 阶段的 attachment_security 检查把附件 MD5
//   逗号拼接写入 evalCtx["attachment_md5"]（internal/sideline/final_action.go），
//   field_registry.go 对应条目 MinStage="sideline"、Operators=["eq","ne",
//   "within"]，用 operator='eq' 精确匹配单个 MD5。
//
// 两个 page（'url_protection' / 'attachment_security'）都不在
// internal/api/unified_rules_pagespec.go 的 unifiedPageSpecs 注册表里，走的是
// CreateUnifiedRule 的生成式（generic）分支：只有 validateConditionNode 校验
// field/operator/stage，field_registry.go 里 attachment_md5 声明的
// `Pages:["advanced_rules"]` 只在 page=='advanced_rules' 时由
// validateAdvancedRulesAllowedFields 强制，对 page='attachment_security' 不
// 生效——如果未来把这条限制收紧到覆盖所有 page，这里也需要同步跟进。
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

export async function addUrlRule(
  value: string,
  field: 'domain' | 'url',
  requestFn: ApiRequestFn,
  priority: number,
): Promise<void> {
  await createUnifiedRule(
    {
      name: `Blacklist ${field === 'domain' ? 'Domain' : 'URL'} ${value}`,
      page: 'url_protection',
      rule_class: 'action',
      stage: 'data',
      action: 'reject',
      priority,
      condition_tree: { type: 'condition', field: 'urls', operator: 'contain', value },
      metadata: { feature: 'url_protection', target: field },
      is_active: true,
    },
    requestFn,
  );
}

export async function addAttachmentHashRule(
  md5: string,
  requestFn: ApiRequestFn,
  priority: number,
): Promise<void> {
  await createUnifiedRule(
    {
      name: `Blacklist Attachment MD5 ${md5}`,
      page: 'attachment_security',
      rule_class: 'action',
      stage: 'sideline',
      action: 'reject',
      priority,
      condition_tree: { type: 'condition', field: 'attachment_md5', operator: 'eq', value: md5 },
      metadata: { feature: 'attachment_security' },
      is_active: true,
    },
    requestFn,
  );
}
