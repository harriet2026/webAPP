'use client';

// InvestigationWorkbench -- 研判工作台（C1-C7）: 两栏布局，左列邮件原文
// （纯文本/HTML/源码三视图 + 下载EML + 敏感词/恶意链接高亮 + 阻断/丢弃状态
// 提示），右列复用 Task 9 的 EntityDetection（C6/C7 内容实体检测）。
//
// C1（多投部分收件人阻断/丢弃警告条）与 C5（单收件人阻断/丢弃遮罩）都从
// detail.recipient_dispositions 派生: status 落在 BLOCKED_STATUSES
// （blocked/rejected/discarded）即视为"该收件人无原文保留"，与
// recipient-status.tsx 的 recipientActionsForStatus 对这三个状态的
// "不可处置/无原文" 归类保持一致（同一份状态词表的两处消费）。
//
// HTML 视图复用既有的安全渲染路径 EmailHtmlView（沙盒 iframe + DOMPurify，
// email-preview-dialog.tsx 同款），不新增 XSS 面。纯文本视图的高亮
// （紧急/财务/审批关键词 + entity_urls 中判定为恶意/可疑的 URL）先对原始
// 文本做 HTML 转义，再用固定的 <mark> 包裹已转义子串
// （highlightPlainText），因此注入 dangerouslySetInnerHTML 的字符串里除了
// 我们自己的 <mark> 标签外不可能包含来自邮件正文的活性 HTML —— 邮件原文本
// 身是攻击者可控内容，这一步转义是必须的，demo 原型的同款实现没有做这一步
// （明文注入未转义文本），照抄会引入真实 XSS。
//
// 源码（源）视图：MailLogDetail 没有裸 EML 字符串字段，EmailPreviewResponse
// （getMailLogPreview）也没有 raw/source 字段 —— 已核对
// src/types/email-preview.ts，只有 headers（Record<string,string>）+
// text_body/html_body。因此"源码"视图懒加载 preview 并渲染
// headers（按 key 排序，一行一个 "Key: value"）+ text_body 兜底，作为
// "header 级 raw" 近似，而不是伪造一个不存在的字段。

import { useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { AlertTriangle, Download, Shield } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { ApiRequestFn } from '@/lib/api/client';
import type { AttachmentInfo, MailLogDetail, URLEntity } from '@/types/email-disposal-detail';
import type { EmailPreviewResponse } from '@/types/email-preview';
import { EmailHtmlView } from '@/components/email/email-html-view';
import { getMailLogPreview, downloadEml } from '../../lib/disposal-detail-api';
import { EntityDetection } from './entity-detection';

type ContentView = 'text' | 'html' | 'raw';

// blocked/rejected/discarded -- 邮件未被投递、系统也未保留原文的三个终态
// （与 recipient-status.tsx 的 STATUS_STYLES/recipientActionsForStatus 用的
// 同一词表；quarantined/pending_review/sidelined/audited 都仍保留原文，不
// 计入）。
const BLOCKED_STATUSES = new Set(['blocked', 'rejected', 'discarded']);

function isBlockedStatus(status?: string): boolean {
  return !!status && BLOCKED_STATUSES.has(status);
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

const SENSITIVE_WORDS = ['紧急', '财务', '审批'];

// highlightPlainText -- 对齐 demo overview-action-section.tsx 的
// highlightSensitiveWords，但先转义原始文本再打 <mark>（见文件头注释）：
// 只操作转义后的字符串（"text node" 语义），不解析/信任邮件正文里的任何
// HTML。
function highlightPlainText(text: string, urls: URLEntity[]): string {
  let escaped = escapeHtml(text);

  for (const word of SENSITIVE_WORDS) {
    const re = new RegExp(escapeRegExp(word), 'g');
    escaped = escaped.replace(
      re,
      `<mark class="rounded bg-amber-200 px-0.5 text-amber-950 dark:bg-amber-500/40 dark:text-amber-100">${word}</mark>`,
    );
  }

  const maliciousUrls = urls.filter(
    (u) => u.verdict === 'malicious' || u.verdict === 'phishing' || u.check_result === 'THREAT' || u.check_result === 'SUSPICIOUS',
  );
  for (const u of maliciousUrls) {
    const escapedUrl = escapeHtml(u.url);
    if (!escapedUrl) continue;
    const re = new RegExp(escapeRegExp(escapedUrl), 'g');
    escaped = escaped.replace(
      re,
      `<mark class="rounded bg-red-200 px-0.5 text-red-950 dark:bg-red-500/40 dark:text-red-100">${escapedUrl}</mark>`,
    );
  }

  return escaped;
}

function formatRawSource(preview: EmailPreviewResponse): string {
  const headerLines = Object.entries(preview.headers ?? {})
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}: ${v}`);
  const parts = [...headerLines];
  if (preview.text_body) {
    parts.push('', preview.text_body);
  }
  return parts.join('\n');
}

interface InvestigationWorkbenchProps {
  detail: MailLogDetail;
  requestFn: ApiRequestFn;
  readOnly?: boolean;
  onDisposed?: () => void;
  // 下载附件的真实实现由调用方注入，透传给 EntityDetection（C7）。
  onDownload?: (attachment: AttachmentInfo) => void;
}

export function InvestigationWorkbench({
  detail, requestFn, readOnly = false, onDisposed, onDownload,
}: InvestigationWorkbenchProps) {
  const t = useTranslations('emailDisposal.detail.overview');
  const [view, setView] = useState<ContentView>('text');
  const [preview, setPreview] = useState<EmailPreviewResponse | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewFetched, setPreviewFetched] = useState(false);

  const dispositions = useMemo(() => detail.recipient_dispositions ?? [], [detail.recipient_dispositions]);
  const blockedDispositions = useMemo(
    () => dispositions.filter((d) => isBlockedStatus(d.status)),
    [dispositions],
  );
  // C1: 多投场景下，部分（不是全部/也不是零个）收件人无原文 -- 提示条本身
  // 就是为了"对比"其余收件人仍有原文可看，全阻断或全放行都没有提示的价值。
  const isMulti = dispositions.length > 1 || (detail.recipients?.length ?? 0) > 1;
  const showBlockedBanner = isMulti && blockedDispositions.length > 0 && blockedDispositions.length < dispositions.length;
  // C5: 单收件人场景，该收件人本身即处于无原文的终态。
  const singleBlocked = dispositions.length === 1 && isBlockedStatus(dispositions[0].status);

  const highlightedText = useMemo(
    () => highlightPlainText(detail.content ?? '', detail.entity_urls ?? []),
    [detail.content, detail.entity_urls],
  );

  async function ensureRawLoaded() {
    if (previewFetched || previewLoading) return;
    setPreviewLoading(true);
    try {
      const p = await getMailLogPreview(detail.id, requestFn);
      setPreview(p);
    } catch {
      // 源码视图退化为"不可用"提示，不打断纯文本/HTML 视图的可用性。
    } finally {
      setPreviewFetched(true);
      setPreviewLoading(false);
    }
  }

  function handleViewChange(v: ContentView) {
    setView(v);
    if (v === 'raw') void ensureRawLoaded();
  }

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
        {/* 左列：邮件原文 */}
        <div className="relative p-4">
          {singleBlocked && (
            <div
              className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 bg-background/95 p-6 text-center"
              data-testid="email-disposal-workbench-blocked-overlay"
            >
              <AlertTriangle className="h-10 w-10 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">{t('workbench.blockedOverlay')}</p>
              <p className="text-xs text-muted-foreground">{t('workbench.blockedOverlaySubtext')}</p>
              <div className="flex gap-2">
                <Button type="button" variant="outline" size="sm" onClick={() => {}}>
                  <Shield className="mr-1 h-3.5 w-3.5" />
                  {t('workbench.viewSmtpSession')}
                </Button>
                <Button type="button" variant="outline" size="sm" onClick={() => {}}>
                  <Shield className="mr-1 h-3.5 w-3.5" />
                  {t('context.viewPolicyDetail')}
                </Button>
              </div>
            </div>
          )}

          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-sm font-semibold">{t('emailContent')}</h3>
            <div className="flex items-center gap-1">
              <Button
                type="button"
                size="sm"
                variant={view === 'text' ? 'secondary' : 'ghost'}
                onClick={() => handleViewChange('text')}
                data-testid="email-disposal-workbench-content-view-text"
              >
                {t('workbench.viewText')}
              </Button>
              <Button
                type="button"
                size="sm"
                variant={view === 'html' ? 'secondary' : 'ghost'}
                onClick={() => handleViewChange('html')}
                data-testid="email-disposal-workbench-content-view-html"
              >
                {t('workbench.viewHtml')}
              </Button>
              <Button
                type="button"
                size="sm"
                variant={view === 'raw' ? 'secondary' : 'ghost'}
                onClick={() => handleViewChange('raw')}
                data-testid="email-disposal-workbench-content-view-raw"
              >
                {t('workbench.viewRaw')}
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="ml-2"
                onClick={() => downloadEml(detail.id, t)}
                data-testid="email-disposal-workbench-download-eml"
              >
                <Download className="mr-1 h-3.5 w-3.5" />
                {t('workbench.downloadEml')}
              </Button>
            </div>
          </div>

          <div className={cn('h-64 overflow-auto rounded border bg-background p-3', singleBlocked && 'invisible')}>
            {view === 'text' && (
              detail.content ? (
                <pre
                  className="whitespace-pre-wrap break-words font-mono text-xs"
                  data-testid="email-disposal-workbench-text-content"
                  dangerouslySetInnerHTML={{ __html: highlightedText }}
                />
              ) : (
                <p className="text-sm text-muted-foreground" data-testid="email-disposal-workbench-text-content">
                  {t('noContent')}
                </p>
              )
            )}
            {view === 'html' && (
              detail.html_content ? (
                <EmailHtmlView htmlBody={detail.html_content} />
              ) : (
                <p className="text-sm text-muted-foreground">{t('noContent')}</p>
              )
            )}
            {view === 'raw' && (
              previewLoading ? (
                <p className="text-sm text-muted-foreground">{t('workbench.rawLoading')}</p>
              ) : preview ? (
                <pre className="whitespace-pre-wrap break-words font-mono text-xs text-muted-foreground" data-testid="email-disposal-workbench-raw-content">
                  {formatRawSource(preview)}
                </pre>
              ) : (
                <p className="text-sm text-muted-foreground">{t('workbench.rawUnavailable')}</p>
              )
            )}
          </div>
        </div>

        {/* 右列：内容实体检测（C6/C7，Task 9） */}
        <div className="p-4">
          <EntityDetection
            detail={detail}
            requestFn={requestFn}
            readOnly={readOnly}
            onDownload={onDownload}
            onDisposed={onDisposed}
          />
        </div>
      </div>
    </div>
  );
}
