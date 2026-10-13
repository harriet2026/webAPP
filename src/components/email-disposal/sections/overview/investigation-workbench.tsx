'use client';

// InvestigationWorkbench -- 研判工作台（C1-C7）: 两栏布局，左列邮件原文
// （MailOriginalCard：纯文本/HTML/源码三视图 + 下载EML + 敏感词/恶意链接
// 高亮 + 阻断/丢弃状态遮罩），右列复用 Task 9 的 EntityDetection（C6/C7
// 内容实体检测）。左列已抽取为独立组件，供钓鱼检测详情抽屉等场景复用，
// 本文件保留工作台的两栏装配与 C1 多投部分阻断提示条。
//
// C1（多投部分收件人阻断/丢弃警告条）从 detail.recipient_dispositions 派生:
// status 落在 BLOCKED_STATUSES（blocked/rejected/discarded）即视为"该收件人
// 无原文保留"，与 recipient-status.tsx 的 recipientActionsForStatus 对这三
// 个状态的 "不可处置/无原文" 归类保持一致（同一份状态词表的两处消费）。

import { useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { AlertTriangle, Link as LinkIcon, Paperclip } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { ApiRequestFn } from '@/lib/api/client';
import type { AttachmentInfo, MailLogDetail } from '@/types/email-disposal-detail';
import { EntityDetection } from './entity-detection';
import { MailOriginalCard, isBlockedStatus } from './MailOriginalCard';

interface InvestigationWorkbenchProps {
  detail: MailLogDetail;
  requestFn: ApiRequestFn;
  readOnly?: boolean;
  onDisposed?: () => void;
  // 下载附件的真实实现由调用方注入，透传给 EntityDetection（C7）。
  onDownload?: (attachment: AttachmentInfo) => void;
  // GT-12600：阻断/丢弃遮罩上的两个入口。「查看SMTP会话」跳原始日志区（SMTP
  // 会话/命中时间线），「查看策略命中详情」跳安全分析区的处置依据卡——此前两个
  // 按钮是空 onClick 死按钮，点击无任何反馈。
  onViewSmtpSession?: () => void;
  onViewPolicyDetail?: () => void;
}

export function InvestigationWorkbench({
  detail, requestFn, readOnly = false, onDisposed, onDownload,
  onViewSmtpSession, onViewPolicyDetail,
}: InvestigationWorkbenchProps) {
  const t = useTranslations('emailDisposal.detail.overview');
  const [entityTab, setEntityTab] = useState<'links' | 'attachments'>('links');

  const dispositions = useMemo(() => detail.recipient_dispositions ?? [], [detail.recipient_dispositions]);
  const blockedDispositions = useMemo(
    () => dispositions.filter((d) => isBlockedStatus(d.status)),
    [dispositions],
  );
  // C1: 多投场景下，部分（不是全部/也不是零个）收件人无原文 -- 提示条本身
  // 就是为了"对比"其余收件人仍有原文可看，全阻断或全放行都没有提示的价值。
  const isMulti = dispositions.length > 1 || (detail.recipients?.length ?? 0) > 1;
  const showBlockedBanner = isMulti && blockedDispositions.length > 0 && blockedDispositions.length < dispositions.length;
  // Only an explicit false disables downloads. Older servers and transient
  // availability-resolution failures omit the field, preserving the existing
  // fail-open behavior instead of hiding a potentially usable fallback EML.
  const emlUnavailable = detail.eml_available === false;
  const emlUnavailableReason = t('workbench.emlUnavailable');

  return (
    <div className="overflow-hidden rounded-lg border" data-testid="email-disposal-investigation-workbench">
      {showBlockedBanner && (
        <div
          className="flex flex-wrap items-center gap-2 border-b border-amber-200 bg-amber-50 px-4 py-2 text-sm text-amber-800 dark:border-amber-900/50 dark:bg-amber-950/20 dark:text-amber-300"
          data-testid="email-disposal-workbench-blocked-banner"
        >
          <AlertTriangle className="h-4 w-4 shrink-0" />
          <span>
            {t('workbench.blockedBanner', {
              names: blockedDispositions.map((d) => d.recipient.split('@')[0]).join(', '),
            })}
          </span>
          <Button
            type="button"
            variant="link"
            size="sm"
            className="h-auto p-0 text-xs"
            onClick={() => {
              document
                .querySelector('[data-testid="email-disposal-recipient-status"]')
                ?.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }}
          >
            [{t('workbench.viewBlockedRecipients')}]
          </Button>
        </div>
      )}

      <div className="grid grid-cols-1 divide-y md:grid-cols-2 md:divide-x md:divide-y-0">
        {/* 左列：邮件原文（已抽取为 MailOriginalCard，钓鱼详情抽屉复用同款） */}
        <MailOriginalCard key={detail.id}
          detail={detail}
          requestFn={requestFn}
          onViewSmtpSession={onViewSmtpSession}
          onViewPolicyDetail={onViewPolicyDetail}
        />

        {/* 右列：内容实体检测（C6/C7，Task 9） */}
        <div className="p-4">
          {/* 标题行：文案居左，Tab 按钮靠右同行显示 */}
          <div className="mb-3 flex items-center justify-between gap-2">
            <h3 className="shrink-0 text-sm font-semibold">{t('entityDetection.title')}</h3>
            <div className="flex gap-2">
              <Button
                type="button"
                size="sm"
                variant={entityTab === 'links' ? 'default' : 'outline'}
                onClick={() => setEntityTab('links')}
                data-testid="email-disposal-overview-entity-tab-links"
              >
                <LinkIcon className="mr-1 h-3.5 w-3.5" />
                {t('entityDetection.linksTab', { n: detail.entity_urls?.length ?? 0 })}
              </Button>
              <Button
                type="button"
                size="sm"
                variant={entityTab === 'attachments' ? 'default' : 'outline'}
                onClick={() => setEntityTab('attachments')}
                data-testid="email-disposal-overview-entity-tab-attachments"
              >
                <Paperclip className="mr-1 h-3.5 w-3.5" />
                {t('entityDetection.attachmentsTab', { n: detail.attachments?.length ?? 0 })}
              </Button>
            </div>
          </div>
          <EntityDetection
            detail={detail}
            requestFn={requestFn}
            readOnly={readOnly}
            onDownload={onDownload}
            downloadDisabled={emlUnavailable}
            downloadDisabledReason={emlUnavailableReason}
            onDisposed={onDisposed}
            tab={entityTab}
          />
        </div>
      </div>
    </div>
  );
}
