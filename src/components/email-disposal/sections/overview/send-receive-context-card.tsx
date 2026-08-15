'use client';

// SendReceiveContextCard -- 概览与处置模块的「收发信上下文」卡片（B1-B7，见
// design/implement/spec/email-disposal-overview-html-spec-alignment.md §2 B
// 节）。取代 overview-section.tsx 原先的极简「基本信息」四行块（执行动作/
// 主题/发信人/收信人），改为 demo 的完整收发信上下文卡：发件人（B1，含 IP/
// geo）、收件人（B2 单投 pill / 多投状态分布 +
// B3 复用既有 RecipientStatus 渲染多投矩阵）、单投不可操作提示（B4）、
// 时间/大小（B5）、展开完整信息开关与详情（B6/B7：身份验证详情 +
// 网络特征）。
//
// B2/B3 的边界：single-recipient（recipient_dispositions.length===1）只渲染
// 一个状态 pill，不再渲染 RecipientStatus 的可操作按钮行 -- 单投的投递/丢弃/
// 召回/通知按钮由 Task 11 与 RecipientStatus 共用的 dispatch hook 承载
// （sender-actions.tsx 文件头注释已预告这一分工），本任务范围内不动
// RecipientStatus 内部实现。多投（含 0 条，交给 RecipientStatus 自身的
// empty 文案）继续按原样渲染 RecipientStatus。

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { AlertTriangle, ChevronDown, Mail, MapPin, Shield } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import type { ApiRequestFn } from '@/lib/api/client';
import type { MailChildEvent, MailLogDetail } from '@/types/email-disposal-detail';
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
  quarantined: 'bg-blue-50 text-blue-700 border-blue-200',
  pending_review: 'bg-amber-50 text-amber-700 border-amber-200',
  sidelined: 'bg-blue-50 text-blue-700 border-blue-200',
  audited: 'bg-amber-50 text-amber-700 border-amber-200',
  blocked: 'bg-orange-50 text-orange-700 border-orange-200',
  rejected: 'bg-orange-50 text-orange-700 border-orange-200',
  discarded: 'bg-red-50 text-red-700 border-red-200',
};
const DEFAULT_STATUS_STYLE = 'bg-gray-50 text-gray-700 border-gray-200';

export function SendReceiveContextCard({ detail, apiRequest, onDisposed, readOnly, events, onViewPolicyDetail }: SendReceiveContextCardProps) {
  const t = useTranslations('emailDisposal.detail.overview');
  const [expanded, setExpanded] = useState(false);

  const dispositions = detail.recipient_dispositions ?? [];
  const isSingle = dispositions.length === 1;
  const single = isSingle ? dispositions[0] : undefined;
  // 「查看策略命中详情」GT-12596 起跳安全分析区的处置依据卡（onViewPolicyDetail）。
  const singleNotOperable = !!single
    && recipientActionsForStatus(single.status, !!single.object_id).length === 0;

  const statusCounts: Record<string, number> = {};
  for (const d of dispositions) statusCounts[d.status] = (statusCounts[d.status] ?? 0) + 1;

  function notImplemented() {
    toast.info(t('senderActions.notImplementedToast'));
  }
  // notImplemented 仍保留供 B4「查看策略命中详情」fallback 使用

  // From 头：有显示名时按 RFC 5322 惯例加引号（"Name" <addr>），无显示名时只
  // 输出裸地址，与 B1 发件人行 deriveDomainName 的展示口径保持一致但不复用
  // 其"域名替代文案"分支——信头场景需要的是原始 sender_name，不做域名兜底。
  const fromHeader = detail.sender_name
    ? `"${detail.sender_name}" <${detail.sender}>`
    : detail.sender || '—';
  // To 头：recipients 是投递目标全量地址（不同于 B2/B3 展示的收件人状态矩阵），
  // 按邮件头惯例用 ", " 连接；为空时兜底 em dash，不做静默省略。
  const toHeader = detail.recipients && detail.recipients.length > 0
    ? detail.recipients.join(', ')
    : '—';
  const mailHeaderText = [
    `From: ${fromHeader}`,
    `To: ${toHeader}`,
    `Subject: ${detail.subject || '—'}`,
    `Date: ${formatTimestamp(detail.received_at) || detail.received_at || '—'}`,
    `Message-ID: ${detail.message_id || '—'}`,
    `Return-Path: ${detail.return_path || '—'}`,
    `Reply-To: ${detail.reply_to || '—'}`,
    `X-Mailer: ${detail.x_mailer || '—'}`,
  ].join('\n');

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
            recipient_dispositions={detail.recipient_dispositions}
            mailLogId={detail.id}
            sender={detail.sender}
            apiRequest={apiRequest}
            onDisposed={onDisposed}
            readOnly={readOnly}
            events={events}
          />
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

        {/* B7 展开完整信息详情：邮件头信息（GT-12967 起替换原「身份验证详情」/
            「网络特征」两个模块——按真实邮件头（RFC 5322）字段顺序 From/To/
            Subject/Date/Message-ID/Return-Path/Reply-To/X-Mailer 拼接为等宽
            信头格式文本。后端目前未落地完整原始信头字符串（无 Received 链、
            X-Originating-IP 等），本区块由 detail 上已有的结构化字段现场拼接
            展示，字段顺序/取值与真实邮件头语义保持一致，为后续切换为后端返回
            的原始信头文本预留同一插槽（data-testid 不变）。 */}
        {expanded && (
          <div className="border-t pt-3 text-xs" data-testid="email-disposal-overview-context-fullinfo">
            <h5 className="mb-2 font-medium">{t('context.mailHeaders')}</h5>
            <pre
              className="overflow-x-auto whitespace-pre-wrap break-all rounded-md border bg-background p-3 font-mono text-[11px] leading-5 text-muted-foreground"
              data-testid="email-disposal-overview-context-mail-headers"
            >
              {mailHeaderText}
            </pre>
          </div>
        )}
      </div>
    </div>
  );
}
