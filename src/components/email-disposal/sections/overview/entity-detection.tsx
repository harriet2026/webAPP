'use client';

// EntityDetection -- 研判工作台右列的「内容实体检测」（C6/C7）。链接 tab（C6）
// 逐条展示 detail.entity_urls 的域名 + 威胁标注 + URL 原文，支持域名/URL 两级
// 加黑；附件 tab（C7）逐条展示 detail.attachments 的文件名/大小/哈希 + AV 结论
// （join detail.scan_results by md5），支持哈希加黑 + 下载。两个 tab 共用统一
// 规则系统的 createUnifiedRule（见 disposal-detail-api.ts 的 addUrlRule /
// addAttachmentHashRule 及其字段映射说明），复用既有 reject 动作，不新增动作
// 类型。
//
// 威胁 badge 文案直接展示后端的 check_result/threat_type 原文；VirusTotal 分数
// 独立渲染在 vt_score 字段存在时（"47/90" 形态，见 URLEntity.vt_score 注释）—
// 后端暂无该字段时优雅降级为不渲染，不臆造数值。
//
// 本组件本任务不挂载进 overview-section（Task 10 负责组装研判工作台并把它放进
// 右列），浏览器像素对齐同样是 Task 10 的范围。

import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { Ban, Download, Info } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useAuth } from '@/contexts/auth-context';
import type { ApiRequestFn } from '@/lib/api/client';
import type { AttachmentInfo, MailLogDetail, URLEntity } from '@/types/email-disposal-detail';
import { formatBytes } from '../../lib/detail-helpers';
import { addAttachmentHashRule, addUrlRule, disposalRulePriority } from '../../lib/disposal-detail-api';

interface EntityDetectionProps {
  detail: MailLogDetail;
  requestFn: ApiRequestFn;
  readOnly?: boolean;
  // 下载附件的真实实现由调用方注入；未提供时点击「下载」只弹一句「暂未实现」
  // 提示（复用 senderActions.notImplementedToast，不新造一句同义文案）。
  onDownload?: (attachment: AttachmentInfo) => void;
  // 成功创建加黑规则后回调，供调用方刷新任何派生视图（对齐 SenderActions 的
  // onDisposed）。
  onDisposed?: () => void;
  // 受控 tab：由调用方持有 state，使 Tab 按钮可上移至标题行右侧（GT-12769）。
  // 未提供时组件内部自持默认值 'links'。
  tab?: EntityTab;
  onTabChange?: (tab: EntityTab) => void;
}

type EntityTab = 'links' | 'attachments';
type ThreatLevel = 'threat' | 'suspicious' | 'safe';

function urlThreatLevel(u: URLEntity): ThreatLevel {
  if (u.check_result === 'THREAT' || u.verdict === 'malicious' || u.verdict === 'phishing') return 'threat';
  if (u.check_result === 'SUSPICIOUS' || u.verdict === 'suspicious') return 'suspicious';
  return 'safe';
}

const LEVEL_STYLES: Record<ThreatLevel, { border: string; badge: string }> = {
  threat: { border: 'border-l-4 border-l-destructive', badge: 'border-red-200 bg-red-50 text-red-700 dark:border-red-900/50 dark:bg-red-950/20 dark:text-red-300' },
  suspicious: { border: 'border-l-4 border-l-amber-500', badge: 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900/50 dark:bg-amber-950/20 dark:text-amber-300' },
  safe: { border: 'border-l-4 border-l-emerald-500', badge: 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/50 dark:bg-emerald-950/20 dark:text-emerald-300' },
};

// urlRowKey -- 行 key / testid 的稳定标识。选择 encodeURIComponent(url) 截断到
// 64 字符，而不是数组 index：index 会在排序/过滤后漂移，URL 原文才是这一行的
// 天然稳定标识；encodeURIComponent 避免把 "/" ":" 等字符带进 DOM
// data-testid，截断避免超长 URL 把 testid 撑爆。
function urlRowKey(url: string): string {
  return encodeURIComponent(url).slice(0, 64);
}

// vtScoreIsPositive -- "47/90" style vt_score strings: a non-zero numerator
// means at least one AV engine flagged the URL, styled red/bold to draw the
// eye; a "0/N" (or unparseable) numerator falls back to the neutral/gray
// styling instead (matches the demo's html_spec §④ 右列 rule).
function vtScoreIsPositive(vtScore: string): boolean {
  const numerator = Number.parseInt(vtScore.split('/')[0] ?? '', 10);
  return Number.isFinite(numerator) && numerator > 0;
}

export function EntityDetection({ detail, requestFn, readOnly = false, onDownload, onDisposed, tab: tabProp, onTabChange }: EntityDetectionProps) {
  const t = useTranslations('emailDisposal.detail.overview.entityDetection');
  const tOverview = useTranslations('emailDisposal.detail.overview');
  const { isSystemAdmin } = useAuth();
  // 受控模式：调用方提供 tab/onTabChange 时使用外部 state；否则降级为非受控。
  const tab: EntityTab = tabProp ?? 'links';
  const setTab = (next: EntityTab) => onTabChange?.(next);
  const [busyKey, setBusyKey] = useState<string | null>(null);

  const urls = detail.entity_urls ?? [];
  const attachments = detail.attachments ?? [];
  const scans = detail.scan_results ?? [];
  // GT-12601：priority 必须落在当前角色的合法区间内（tenant_admin 只接受
  // 100-1000），否则后端 400、加黑永远失败。
  const rulePriority = disposalRulePriority(isSystemAdmin);

  async function handleUrlRule(key: string, value: string, field: 'domain' | 'url') {
    setBusyKey(key);
    try {
      await addUrlRule(value, field, requestFn, rulePriority);
      toast.success(t('ruleSuccess'));
      onDisposed?.();
    } catch {
      toast.error(t('ruleFailed'));
    } finally {
      setBusyKey(null);
    }
  }

  async function handleAttachmentRule(key: string, md5: string) {
    setBusyKey(key);
    try {
      await addAttachmentHashRule(md5, requestFn, rulePriority);
      toast.success(t('ruleSuccess'));
      onDisposed?.();
    } catch {
      toast.error(t('ruleFailed'));
    } finally {
      setBusyKey(null);
    }
  }

  function handleDownload(a: AttachmentInfo) {
    if (onDownload) onDownload(a);
    else toast.info(tOverview('senderActions.notImplementedToast'));
  }

  return (
    <div className="space-y-3" data-testid="email-disposal-overview-entity-detection">
      <div
        className="flex items-start gap-2 rounded-md border border-blue-200 bg-blue-50 px-3 py-2 text-xs text-blue-700 dark:border-blue-900/50 dark:bg-blue-950/20 dark:text-blue-300"
        data-testid="email-disposal-overview-entity-global-hint"
      >
        <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
        <span>{t('globalHint')}</span>
      </div>

      {tab === 'links' && (
        urls.length === 0 ? (
          <p
            className="py-6 text-center text-sm text-muted-foreground"
            data-testid="email-disposal-overview-entity-links-empty"
          >
            {t('noLinks')}
          </p>
        ) : (
          <div className="space-y-2">
            {urls.map((u) => {
              const key = urlRowKey(u.url);
              const level = urlThreatLevel(u);
              const styles = LEVEL_STYLES[level];
              const threatText = u.threat_type || u.check_result;
              const busy = busyKey === key;
              return (
                <div
                  key={key}
                  className={cn('rounded-md border bg-card p-3 text-sm', styles.border)}
                  data-testid={`email-disposal-overview-entity-link-${key}`}
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium">{u.domain}</span>
                    {threatText && (
                      <Badge variant="outline" className={styles.badge}>
                        {threatText}
                      </Badge>
                    )}
                    {u.vt_score && (
                      <Badge
                        variant="outline"
                        className={cn(
                          'font-bold',
                          vtScoreIsPositive(u.vt_score)
                            ? 'border-red-200 text-red-700 dark:border-red-900/50 dark:text-red-300'
                            : 'border-muted-foreground/20 font-normal text-muted-foreground',
                        )}
                        data-testid={`email-disposal-overview-entity-link-${key}-vt-score`}
                      >
                        {t('vtScore', { score: u.vt_score })}
                      </Badge>
                    )}
                  </div>
                  <p className="mt-1 truncate text-xs text-muted-foreground" title={u.url}>{u.url}</p>
                  <div className="mt-2 flex gap-2">
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      disabled={readOnly || busy}
                      onClick={() => handleUrlRule(key, u.domain, 'domain')}
                      data-testid={`email-disposal-overview-entity-link-${key}-blacklist-domain`}
                    >
                      <Ban className="mr-1 h-3.5 w-3.5" />
                      {t('blacklistDomain')}
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      disabled={readOnly || busy}
                      onClick={() => handleUrlRule(key, u.url, 'url')}
                      data-testid={`email-disposal-overview-entity-link-${key}-blacklist-url`}
                    >
                      <Ban className="mr-1 h-3.5 w-3.5" />
                      {t('blacklistUrl')}
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        )
      )}

      {tab === 'attachments' && (
        attachments.length === 0 ? (
          <p
            className="py-6 text-center text-sm text-muted-foreground"
            data-testid="email-disposal-overview-entity-attachments-empty"
          >
            {t('noAttachments')}
          </p>
        ) : (
          <div className="space-y-2">
            {attachments.map((a, i) => {
              const key = a.md5sum || String(i);
              // 对齐 analysis-section.tsx 已有的同款 join 约定：按 md5 匹配
              // scan_results（AttachmentScanResult.attachment_md5，不是
              // md5sum），virus_name 非空即判定为命中。
              const scan = scans.find((s) => s.attachment_md5 && a.md5sum && s.attachment_md5 === a.md5sum);
              const busy = busyKey === key;
              return (
                <div
                  key={key}
                  className="rounded-md border bg-card p-3 text-sm"
                  data-testid={`email-disposal-overview-entity-attachment-${key}`}
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="max-w-[16rem] truncate font-medium">{a.filename}</span>
                    <Badge variant="outline">{formatBytes(a.size)}</Badge>
                    {scan?.virus_name && (
                      <Badge
                        variant="outline"
                        className="border-red-200 bg-red-50 text-red-700 dark:border-red-900/50 dark:bg-red-950/20 dark:text-red-300"
                      >
                        {scan.virus_name}
                      </Badge>
                    )}
                  </div>
                  <p className="mt-1 font-mono text-xs text-muted-foreground">
                    MD5: {a.md5sum || '—'}
                  </p>
                  <div className="mt-2 flex gap-2">
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      disabled={readOnly || !a.md5sum || busy}
                      onClick={() => a.md5sum && handleAttachmentRule(key, a.md5sum)}
                      data-testid={`email-disposal-overview-entity-attachment-${key}-blacklist-hash`}
                    >
                      <Ban className="mr-1 h-3.5 w-3.5" />
                      {t('blacklistHash')}
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => handleDownload(a)}
                      data-testid={`email-disposal-overview-entity-attachment-${key}-download`}
                    >
                      <Download className="mr-1 h-3.5 w-3.5" />
                      {t('download')}
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        )
      )}
    </div>
  );
}
