'use client';

// SendReceiveContextCard -- 概览与处置模块的「收发信上下文」卡片（B1-B7，见
// design/implement/spec/email-disposal-overview-html-spec-alignment.md §2 B
// 节）。取代 overview-section.tsx 原先的极简「基本信息」四行块（执行动作/
// 主题/发信人/收信人），改为 demo 的完整收发信上下文卡：发件人（B1，含 IP/
// geo）、收件人（B2 单投 pill / 多投状态分布 +
// B3 复用既有 RecipientStatus 渲染多投矩阵）、单投不可操作提示（B4）、
// 时间/大小（B5）、展开完整信息开关与持久化邮件头（B6/B7）。
//
// B2/B3 的边界：single-recipient（recipient_dispositions.length===1）只渲染
// 一个状态 pill，不再渲染 RecipientStatus 的可操作按钮行 -- 单投的投递/丢弃/
// 召回/通知按钮由 Task 11 与 RecipientStatus 共用的 dispatch hook 承载
// （sender-actions.tsx 文件头注释已预告这一分工），本任务范围内不动
// RecipientStatus 内部实现。多投（含 0 条，交给 RecipientStatus 自身的
// empty 文案）继续按原样渲染 RecipientStatus。
//
// GT-12758 起，B2/B3 的数据源不再是 detail.recipient_dispositions 本身，而是
// fallbackDispositions() 兜过一层的结果：处置记录为空时用 detail.recipients
// 回落。详见该函数的注释。

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { AlertTriangle, ChevronDown, Mail, MapPin, Shield } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import type { ApiRequestFn } from '@/lib/api/client';
import type { MailChildEvent, MailLogDetail, RecipientDisposition } from '@/types/email-disposal-detail';
import { formatTimestamp } from '@/lib/format-time';
import { deriveDomainName, formatBytes, recipientActionsForStatus } from '../../lib/detail-helpers';
import { RecipientStatus } from '../../components/recipient-status';

interface SendReceiveContextCardProps {
  detail: MailLogDetail;
  apiRequest: ApiRequestFn;
  onDisposed: () => void;
  readOnly: boolean;
  // Per-recipient delivery events, threaded straight through to
  // RecipientStatus (delivered-status detail line, DD-11 part 2).
  events?: MailChildEvent[];
  // GT-12596：B4「查看策略命中详情」跳转安全分析区的处置依据卡（detail-modal
  // 的 scrollToSection('analysis')）。未注入时回退「暂未实现」toast。
  onViewPolicyDetail?: () => void;
}

// STATUS_STYLES intentionally duplicates recipient-status.tsx's own
// (unexported) status→className map, just for this card's single-recipient
// status pill (B2) -- the brief forbids touching RecipientStatus internals
// (Task 11's scope), and the multi-recipient path renders that component
// unmodified (B3) rather than reimplementing its table here.
const STATUS_STYLES: Record<string, string> = {
  delivered: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  marked_delivered: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  // GT-12835：accept 收件人 milter 时点是在途，投递事实回写后转 delivered /
  // delivery_failed；tempfail 整封暂缓时 accept 收件人转 deferred。
  delivering: 'bg-sky-50 text-sky-700 border-sky-200',
  delivery_failed: 'bg-red-50 text-red-700 border-red-200',
  deferred: 'bg-amber-50 text-amber-700 border-amber-200',
  bounced: 'bg-orange-50 text-orange-700 border-orange-200',
  quarantined: 'bg-blue-50 text-blue-700 border-blue-200',
  pending_review: 'bg-amber-50 text-amber-700 border-amber-200',
  sidelined: 'bg-blue-50 text-blue-700 border-blue-200',
  audited: 'bg-amber-50 text-amber-700 border-amber-200',
  blocked: 'bg-orange-50 text-orange-700 border-orange-200',
  rejected: 'bg-orange-50 text-orange-700 border-orange-200',
  discarded: 'bg-red-50 text-red-700 border-red-200',
};
const DEFAULT_STATUS_STYLE = 'bg-gray-50 text-gray-700 border-gray-200';

// GT-12758：整封动作 → 收件人状态，与后端 internal/antispam 的 statusForAction
// 同一张表。只在回落路径（recipient_dispositions 为空）里用。
function statusForAction(action: string): string {
  switch ((action || '').toLowerCase()) {
    case 'reject': return 'rejected';
    case 'bounce': return 'bounced';
    case 'quarantine': return 'quarantined';
    case 'sideline': return 'sidelined';
    case 'audit': return 'audited';
    case 'discard': return 'discarded';
    // GT-12835 对称补齐后 accept 的 milter 态是在途（delivering），终态由投递
    // 事实回写。回落路径优先用 detail.status，因此存量 accept 行（status 列有
    // delivered）显示不受影响。
    default: return 'delivering';
  }
}

// GT-12758：处置记录缺失时用信封收件人回落出一份等价名单。
//
// 「N 个收件人」一直数的是 recipient_dispositions 的条数，完全不看
// detail.recipients。后端整封路径的 reject/accept 两个分支此前从不写处置记录
// （bounce/quarantine/sideline/audit/discard 都写了），于是这类邮件的详情页恒
// 显示「0 个收件人」「暂无收件人处置记录」。后端已补写，但库里的存量行不会被
// 追溯修复，所以这一层回落必须长期保留：至少让运维看得到「发给了谁、整体结果
// 是什么」。回落条目没有 object_id，因此不会解锁任何需要原文对象的操作。
function fallbackDispositions(detail: MailLogDetail): RecipientDisposition[] {
  const status = detail.status || statusForAction(detail.action);
  return (detail.recipients ?? []).map((recipient) => ({
    recipient,
    final_action: detail.action || '',
    status,
  }));
}

export function SendReceiveContextCard({ detail, apiRequest, onDisposed, readOnly, events, onViewPolicyDetail }: SendReceiveContextCardProps) {
  const t = useTranslations('emailDisposal.detail.overview');
  const [expanded, setExpanded] = useState(false);

  // GT-12758：处置记录为空时回落到信封收件人（见 fallbackDispositions）。
  const persisted = detail.recipient_dispositions ?? [];
  const dispositions = persisted.length > 0 ? persisted : fallbackDispositions(detail);
  const isSingle = dispositions.length === 1;
  const single = isSingle ? dispositions[0] : undefined;
  // 「查看策略命中详情」GT-12596 起跳安全分析区的处置依据卡（onViewPolicyDetail）。
  // GT-12880：投递失败（delivery_failed）是"网关已放行投递、下游接收失败"，
  // 与拦截族（rejected/discarded 等，网关拦下且未保留原文）语义相反——两者都
  // 落在"无可用动作"里，但绝不能共用"已被阻断/丢弃"文案。
  const singleDeliveryFailed = !!single && single.status === 'delivery_failed';
  const singleNotOperable = !!single && !singleDeliveryFailed
    && recipientActionsForStatus(single.status, !!single.object_id).length === 0;

  const statusCounts: Record<string, number> = {};
  for (const d of dispositions) statusCounts[d.status] = (statusCounts[d.status] ?? 0) + 1;

  function notImplemented() {
    toast.info(t('senderActions.notImplementedToast'));
  }
  // notImplemented 仍保留供 B4「查看策略命中详情」fallback 使用

  return (
    <div className="rounded-lg border bg-muted/30 p-4 space-y-3" data-testid="email-disposal-overview-context-card">
      <h3 className="flex items-center gap-2 text-sm font-semibold">
        <Mail className="h-4 w-4 text-blue-600" />
        {t('context.title')}
      </h3>

      <div className="space-y-2 text-sm">
        {/* B1 发件人 */}
        <div className="flex flex-wrap items-center gap-2" data-testid="email-disposal-overview-context-sender">
          <span className="w-16 shrink-0 text-muted-foreground">{t('sender')}:</span>
          <span className="font-medium">
            {deriveDomainName(detail.sender, detail.sender_name)} &lt;{detail.sender}&gt;
          </span>
          <span className="text-muted-foreground">IP: {detail.client_ip || '—'}</span>
          <Badge variant="outline" className="gap-1 text-xs">
            <MapPin className="h-3 w-3" />
            {detail.geo_region_name || detail.geo_city || detail.geo_isp || '—'}
          </Badge>
        </div>

        {/* B2 收件人（单投 pill / 多投状态分布） */}
        <div className="flex flex-wrap items-start gap-2" data-testid="email-disposal-overview-context-recipient">
          <span className="w-16 shrink-0 pt-1 text-muted-foreground">{t('recipient')}:</span>
          {isSingle && single ? (
            <div className="flex items-center gap-2">
              <span className="font-medium">{single.recipient}</span>
              <Badge variant="outline" className={STATUS_STYLES[single.status] || DEFAULT_STATUS_STYLE}>
                {t(`recipientStatus.status.${single.status}`, { default: single.status })}
              </Badge>
            </div>
          ) : (
            <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              <span>{t('context.recipientsCount', { n: dispositions.length })}</span>
              {Object.keys(statusCounts).length > 0 && (
                <>
                  <span>|</span>
                  <span>
                    {Object.entries(statusCounts)
                      .map(([status, count]) => `${t(`recipientStatus.status.${status}`, { default: status })}: ${count}`)
                      .join(' | ')}
                  </span>
                </>
              )}
            </div>
          )}
        </div>

        {/* B3 多投：复用既有 RecipientStatus（不改其内部实现，Task 11 负责） */}
        {!isSingle && (
          <RecipientStatus
            recipient_dispositions={dispositions}
            mailLogId={detail.id}
            sender={detail.sender}
            apiRequest={apiRequest}
            onDisposed={onDisposed}
            readOnly={readOnly}
            events={events}
          />
        )}

        {/* GT-12880 投递失败提示：已放行投递、下游接收失败——不是阻断/丢弃 */}
        {isSingle && singleDeliveryFailed && (
          <div
            className="mt-1 flex flex-wrap items-center gap-2 rounded border border-red-200 bg-red-50 p-3 text-sm dark:border-red-900/50 dark:bg-red-950/20"
            data-testid="email-disposal-overview-context-delivery-failed"
          >
            <AlertTriangle className="h-4 w-4 shrink-0 text-red-600" />
            <span>{t('context.deliveryFailedWarning')}</span>
          </div>
        )}

        {/* B4 单投不可操作提示 */}
        {isSingle && singleNotOperable && (
          <div
            className="mt-1 flex flex-wrap items-center gap-2 rounded border border-amber-200 bg-amber-50 p-3 text-sm dark:border-amber-900/50 dark:bg-amber-950/20"
            data-testid="email-disposal-overview-context-not-operable"
          >
            <AlertTriangle className="h-4 w-4 shrink-0 text-amber-600" />
            <span>{t('context.notOperableWarning')}</span>
            <Button
              variant="link"
              size="sm"
              className="h-auto p-0 text-xs"
              data-testid="email-disposal-overview-context-view-policy"
              onClick={onViewPolicyDetail ?? notImplemented}
            >
              <Shield className="mr-1 h-3 w-3" />
              {t('context.viewPolicyDetail')}
            </Button>
          </div>
        )}

        {/* B5 时间/大小 */}
        <div
          className="flex flex-wrap items-center gap-4 pt-1 text-xs text-muted-foreground"
          data-testid="email-disposal-overview-context-time-size"
        >
          <span>
            {t('context.time')}: {formatTimestamp(detail.received_at) || detail.received_at || '—'}
            {' → '}
            {formatTimestamp(detail.delivered_at) || formatTimestamp(detail.received_at) || detail.delivered_at || detail.received_at || '—'}
          </span>
          <span>|</span>
          <span>{t('context.size')}: {formatBytes(detail.storage_size)}</span>
        </div>

        {/* B6 展开完整信息 */}
        <Button
          variant="link"
          size="sm"
          className="h-auto p-0 text-xs"
          data-testid="email-disposal-overview-context-expand-fullinfo"
          onClick={() => setExpanded((v) => !v)}
        >
          {expanded ? t('collapse') : t('context.expandFullInfo')}
          <ChevronDown className={`ml-1 h-3 w-3 transition-transform duration-[240ms] ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none ${expanded ? 'rotate-180' : ''}`} />
        </Button>

        {/* B7 展开完整信息详情：GT-12966 起只展示 mail_log 持久化的信头。
            sender/recipients/received_at 是 SMTP 信封与网关时间，不能伪造成
            RFC From/To/Date；raw_headers 为空（存量行）时明确提示不可用。 */}
        {expanded && (
          <div className="border-t pt-3 text-xs" data-testid="email-disposal-overview-context-fullinfo">
            <h5 className="mb-2 font-medium">{t('context.mailHeaders')}</h5>
            <pre
              className="overflow-x-auto whitespace-pre-wrap break-all rounded-md border bg-background p-3 font-mono text-[11px] leading-5 text-muted-foreground"
              data-testid="email-disposal-overview-context-mail-headers"
            >
              {detail.raw_headers || t('context.mailHeadersUnavailable')}
            </pre>
            {detail.raw_headers_truncated && (
              <p className="mt-2 text-amber-700 dark:text-amber-400" data-testid="email-disposal-overview-context-mail-headers-truncated">
                {t('context.mailHeadersTruncated')}
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
