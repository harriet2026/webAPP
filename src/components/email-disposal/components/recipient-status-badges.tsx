// recipient-status-badges.tsx — mixed 邮件的单一主要类别 Badge + hover 明细。
//
// mixed 邮件的收件人被拆分成不同处置时，不再用迷你色条（色条在表格中行高突兀、
// 圆角/字号与标准 Badge 不统一）。改为只渲染一个主要类别 Badge，其余类别
// 折叠为 +N；hover 展开完整逐收件人明细。
//
// 两个维度：
//   - 执行动作列（dimension='action'）：按 final_action 聚类
//   - 邮件状态列（dimension='status'）：按投递 status 聚类

import { useMemo } from 'react';
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { useTranslations } from 'next-intl';
import { cn } from '@/lib/utils';
import {
  normalizeRawActionToExecutionAction,
  normalizeRawStatusToDisplayStatus,
} from '@/lib/email-log-action';
import type { DisplayStatusEntry } from '@/types/email-disposal';
import type { RecipientDisposition } from '@/types/phishing-detection';

export type Dimension = 'action' | 'status';
// GT-12835：状态维度新增 delivering / failed 两类——accept 收件人 milter 时点
// 是在途（delivering），投递事实回写后转 delivered / delivery_failed；把在途归进
// "投递成功"类正是本缺陷的形态（把还没送到/送失败的报成成功）。动作维度
// （final_action）不会产出这两类。
export type Category = 'delivered' | 'delivering' | 'failed' | 'cancelled' | 'quarantine' | 'rejected' | 'sideline' | 'discarded' | 'audit' | 'other';

export interface RcptStatusBucket {
  key: string;
  recipients: string[];
  details: RecipientDisposition[];
}

// ── 维度：action（执行动作列）─────────────────────────────────────
const ACTION_CATEGORY: Record<string, Category> = {
  accept: 'delivered',
  sideline: 'sideline',
  quarantine: 'quarantine',
  reject: 'rejected',
  bounce: 'rejected',
  discard: 'discarded',
  audit: 'audit',
};

export function actionCategory(action: string): Category {
  return ACTION_CATEGORY[(action || '').toLowerCase()] ?? 'other';
}

// ── 维度：status（邮件状态列）─────────────────────────────────────
const STATUS_CATEGORY: Record<string, Category> = {
  delivered: 'delivered',
  delivering: 'delivering',
  in_delivery: 'delivering',
  deferred: 'delivering',
  quarantined: 'quarantine',
  sidelined: 'sideline',
  pending: 'sideline',
  reinjected: 'delivered',
  rejected: 'rejected',
  bounced: 'failed',
  discarded: 'discarded',
  failed: 'failed',
  delivery_failed: 'failed',
  cancelled: 'cancelled',
  delivery_cancelled: 'cancelled',
  quarantine_pending: 'quarantine',
  sideline_pending: 'sideline',
  audit_pending: 'audit',
  recall_pending: 'delivering',
  recall_success: 'delivered',
  recall_failed: 'failed',
  expired: 'discarded',
  audited: 'audit',
  pending_review: 'audit',
};

export function statusCategory(status: string): Category {
  return STATUS_CATEGORY[(status || '').toLowerCase()] ?? 'other';
}

const CATEGORY_ORDER: Record<Category, number> = {
  delivered: 0,
  delivering: 0,
  sideline: 1,
  audit: 2,
  quarantine: 3,
  discarded: 4,
  rejected: 5,
  failed: 5,
  cancelled: 5,
  other: 6,
};

const RISK_PRIORITY: Record<Category, number> = {
  quarantine: 0,
  audit: 1,
  sideline: 2,
  failed: 3,
  cancelled: 4,
  rejected: 5,
  discarded: 6,
  delivering: 7,
  delivered: 8,
  other: 9,
};

export function isBucketHighlighted(
  bucketKey: string,
  highlightKeys: string[] | undefined,
  dimension: Dimension = 'action',
): boolean {
  if (!highlightKeys?.length) return false;

  if (dimension === 'action' && bucketKey.toLowerCase() === 'reject') {
    return highlightKeys.includes('block') || highlightKeys.includes('drop');
  }
  const normalized =
    dimension === 'action'
      ? normalizeRawActionToExecutionAction(bucketKey)
      : normalizeRawStatusToDisplayStatus(bucketKey);
  return highlightKeys.includes(normalized);
}

export function sortBucketsByHighlight<T extends { key: string }>(
  buckets: T[],
  highlightKeys: string[] | undefined,
  dimension: Dimension = 'action',
): T[] {
  if (!highlightKeys?.length) return buckets;
  return [...buckets].sort((a, b) =>
    Number(isBucketHighlighted(b.key, highlightKeys, dimension)) -
    Number(isBucketHighlighted(a.key, highlightKeys, dimension)),
  );
}

export function pickPrimaryBucket<T extends { key: string; recipients: string[] }>(
  buckets: T[],
  toCategory: (key: string) => Category,
  highlightKeys?: string[],
  dimension: Dimension = 'action',
): T {
  const highlighted = buckets.filter((bucket) =>
    isBucketHighlighted(bucket.key, highlightKeys, dimension),
  );
  if (highlighted.length > 0) {
    return highlighted.reduce((best, bucket) =>
      bucket.recipients.length > best.recipients.length ? bucket : best,
    );
  }
  return [...buckets].sort((a, b) => {
    const risk = RISK_PRIORITY[toCategory(a.key)] - RISK_PRIORITY[toCategory(b.key)];
    return risk || b.recipients.length - a.recipients.length;
  })[0]!;
}

/**
 * 从后端权威 display_statuses 中选择表格主 Badge。筛选生效时只在命中项中按
 * count 取最大值；默认态沿用 mixed Badge 已批准的风险优先级。
 */
export function pickPrimaryDisplayStatus(
  entries: DisplayStatusEntry[],
  highlightKeys?: string[],
): DisplayStatusEntry {
  const highlighted = highlightKeys?.length
    ? entries.filter((entry) => highlightKeys.includes(entry.status))
    : [];
  if (highlighted.length > 0) {
    return highlighted.reduce((best, entry) =>
      entry.count > best.count ? entry : best,
    );
  }
  return [...entries].sort((a, b) => {
    const risk =
      RISK_PRIORITY[statusCategory(a.status)] -
      RISK_PRIORITY[statusCategory(b.status)];
    return risk || b.count - a.count;
  })[0]!;
}

/** Badge variant：统一用 outline（轻量边框），靠圆点+文字颜色区分语义。
 *  避免深实底色(default)与浅色(destructive/secondary)并排时视觉重量不平衡。 */
const CATEGORY_VARIANT: Record<Category, 'outline'> = {
  delivered: 'outline',
  delivering: 'outline',
  failed: 'outline',
  cancelled: 'outline',
  sideline: 'outline',
  quarantine: 'outline',
  audit: 'outline',
  discarded: 'outline',
  rejected: 'outline',
  other: 'outline',
};

/** 圆点颜色 + 文字颜色，按语义类别。圆点与文字同色系，视觉一致。 */
const CATEGORY_DOT: Record<Category, string> = {
  delivered: 'bg-emerald-500',
  delivering: 'bg-cyan-500',
  failed: 'bg-red-500',
  cancelled: 'bg-slate-500',
  sideline: 'bg-sky-500',
  quarantine: 'bg-amber-500',
  audit: 'bg-violet-500',
  discarded: 'bg-slate-400',
  rejected: 'bg-red-500',
  other: 'bg-slate-300',
};

/** 文字颜色 class，与圆点同色系但略深以增强对比度。 */
const CATEGORY_TEXT: Record<Category, string> = {
  delivered: 'text-emerald-600',
  delivering: 'text-cyan-600',
  failed: 'text-red-600',
  cancelled: 'text-slate-600',
  sideline: 'text-sky-600',
  quarantine: 'text-amber-600',
  audit: 'text-violet-600',
  discarded: 'text-slate-500',
  rejected: 'text-red-600',
  other: 'text-slate-500',
};

/** 动作维度标签（执行动作列）：投递/隔离/旁路… */
const ACTION_LABEL_KEY: Record<Category, string> = {
  delivered: 'recipientStatusBar.delivered',
  // 动作维度产不出这两类（final_action 没有对应值），仅为满足 Record 完整性。
  delivering: 'recipientStatusBar.delivered',
  failed: 'recipientStatusBar.rejected',
  cancelled: 'recipientStatusBar.discarded',
  sideline: 'recipientStatusBar.sideline',
  quarantine: 'recipientStatusBar.quarantine',
  rejected: 'recipientStatusBar.rejected',
  discarded: 'recipientStatusBar.discarded',
  audit: 'recipientStatusBar.audit',
  other: 'recipientStatusBar.other',
};

/** 状态维度标签（邮件状态列）：复用搜索栏 filters.statuses.* 文案，保持一致。 */
const STATUS_LABEL_KEY: Record<Category, string> = {
  delivered: 'filters.statuses.delivered',
  delivering: 'filters.statuses.delivering',
  failed: 'filters.statuses.delivery_failed',
  cancelled: 'filters.statuses.delivery_cancelled',
  sideline: 'filters.statuses.sideline_pending',
  quarantine: 'filters.statuses.quarantine_pending',
  rejected: 'filters.statuses.rejected',
  discarded: 'filters.statuses.discarded',
  audit: 'filters.statuses.audit_pending',
  other: 'recipientStatusBar.other',
};

/** 取指定维度的标签 key。 */
export function labelKeyFor(dim: Dimension, cat: Category): string {
  const map = dim === 'action' ? ACTION_LABEL_KEY : STATUS_LABEL_KEY;
  return map[cat] ?? ACTION_LABEL_KEY.other;
}

/**
 * 把 recipient_dispositions 按指定维度聚类成有序 buckets。
 */
export function bucketRecipients(
  dispositions: RecipientDisposition[],
  dimension: Dimension = 'action',
): RcptStatusBucket[] {
  const map = new Map<string, RecipientDisposition[]>();
  for (const d of dispositions) {
    const key =
      dimension === 'action'
        ? (d.final_action || d.original_action || '').toLowerCase() || 'unknown'
        : (d.status || '').toLowerCase() || 'unknown';
    const arr = map.get(key) ?? [];
    arr.push(d);
    map.set(key, arr);
  }
  const toCat = dimension === 'action' ? actionCategory : statusCategory;
  return Array.from(map.entries())
    .map(([key, details]) => ({
      key,
      details,
      recipients: details.map((d) => d.recipient),
    }))
    .sort((a, b) => {
      const ord = (CATEGORY_ORDER[toCat(a.key)] ?? 99) - (CATEGORY_ORDER[toCat(b.key)] ?? 99);
      if (ord !== 0) return ord;
      return a.key.localeCompare(b.key);
    });
}

/** 向后兼容旧导出名。 */
export const bucketRecipientsByAction = (d: RecipientDisposition[]) => bucketRecipients(d, 'action');

interface RecipientStatusBadgesProps {
  dispositions: RecipientDisposition[];
  dimension?: Dimension;
  highlightKeys?: string[];
}

export function RecipientStatusBadges({
  dispositions,
  dimension = 'action',
  highlightKeys,
}: RecipientStatusBadgesProps) {
  const t = useTranslations('emailDisposal');
  const toCat = dimension === 'action' ? actionCategory : statusCategory;
  const buckets = useMemo(
    () => sortBucketsByHighlight(bucketRecipients(dispositions, dimension), highlightKeys, dimension),
    [dispositions, dimension, highlightKeys],
  );

  if (buckets.length === 0) return null;

  // 单一桶 → 只显示一个 Badge（不加人数，因为全员相同动作无需强调数量）
  if (buckets.length === 1) {
    const cat = toCat(buckets[0].key);
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger render={<span className="inline-flex" />}>
            <Badge variant={CATEGORY_VARIANT[cat]} className="gap-1 border-current/30">
              <span className={cn('inline-block h-1.5 w-1.5 rounded-full', CATEGORY_DOT[cat])} />
              <span className={CATEGORY_TEXT[cat]}>{t(labelKeyFor(dimension, cat))}</span>
            </Badge>
          </TooltipTrigger>
          <TooltipContent side="top" className="max-w-md">
            <RecipientTooltipBody buckets={buckets} toCat={toCat} dimension={dimension} />
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }

  const primary = pickPrimaryBucket(buckets, toCat, highlightKeys, dimension);
  const primaryCategory = toCat(primary.key);

  // 多桶只展示一个主要类别；其余类别折叠为 +N，完整明细保留在 tooltip。
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger render={<span className="inline-flex" />}>
          <Badge variant={CATEGORY_VARIANT[primaryCategory]} className="gap-1 border-current/30">
            <span className={cn('inline-block h-1.5 w-1.5 rounded-full', CATEGORY_DOT[primaryCategory])} />
            <span className={CATEGORY_TEXT[primaryCategory]}>
              {t(labelKeyFor(dimension, primaryCategory))} {primary.recipients.length}
            </span>
            <span className="font-normal text-muted-foreground/70">+{buckets.length - 1}</span>
          </Badge>
        </TooltipTrigger>
        <TooltipContent side="top" className="max-w-md">
          <RecipientTooltipBody buckets={buckets} toCat={toCat} dimension={dimension} primaryKey={primary.key} />
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

interface DisplayStatusBadgesProps {
  entries: DisplayStatusEntry[];
  highlightKeys?: string[];
}

/**
 * 邮件状态列的展示组件。状态与 count 只读取后端 display_statuses；
 * recipient_dispositions 不参与状态计算，避免 mixed+召回时出现双真源。
 */
export function DisplayStatusBadges({
  entries,
  highlightKeys,
}: DisplayStatusBadgesProps) {
  const t = useTranslations('emailDisposal');
  if (entries.length === 0) return null;

  const primary = pickPrimaryDisplayStatus(entries, highlightKeys);
  const primaryCategory = statusCategory(primary.status);
  const badge = (
    <Badge
      variant={CATEGORY_VARIANT[primaryCategory]}
      className="gap-1 border-current/30"
    >
      <span
        className={cn(
          'inline-block h-1.5 w-1.5 rounded-full',
          CATEGORY_DOT[primaryCategory],
        )}
      />
      <span className={CATEGORY_TEXT[primaryCategory]}>
        {t(`filters.statuses.${primary.status}`)}
        {entries.length > 1 ? ` ${primary.count}` : ''}
      </span>
      {entries.length > 1 ? (
        <span className="font-normal text-muted-foreground/70">
          +{entries.length - 1}
        </span>
      ) : null}
    </Badge>
  );

  if (entries.length === 1) return badge;

  const sortedEntries = [...entries].sort((a, b) => {
    const aHit = highlightKeys?.includes(a.status) ? 1 : 0;
    const bHit = highlightKeys?.includes(b.status) ? 1 : 0;
    return bHit - aHit;
  });
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger render={<span className="inline-flex" />}>
          {badge}
        </TooltipTrigger>
        <TooltipContent side="top" className="max-w-md">
          <div className="space-y-1.5">
            {sortedEntries.map((entry) => {
              const category = statusCategory(entry.status);
              return (
                <div
                  key={entry.status}
                  className={cn(
                    'flex items-center gap-1.5 rounded-sm font-medium',
                    entry.status === primary.status &&
                      '-mx-1.5 bg-muted/60 px-1.5 py-1',
                  )}
                >
                  <span
                    className={cn(
                      'inline-block h-2 w-2 rounded-full',
                      CATEGORY_DOT[category],
                    )}
                  />
                  <span>
                    {t(`filters.statuses.${entry.status}`)} ×{entry.count}
                  </span>
                </div>
              );
            })}
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

function RecipientTooltipBody({
  buckets,
  toCat,
  dimension,
  primaryKey,
}: {
  buckets: RcptStatusBucket[];
  toCat: (key: string) => Category;
  dimension: Dimension;
  primaryKey?: string;
}) {
  const t = useTranslations('emailDisposal');
  return (
    <div className="space-y-1.5">
      {buckets.map((b) => {
        const cat = toCat(b.key);
        return (
          <div
            key={b.key}
            className={cn(
              'space-y-0.5 rounded-sm',
              b.key === primaryKey && '-mx-1.5 bg-muted/60 px-1.5 py-1',
            )}
          >
            <div className="flex items-center gap-1.5 font-medium">
              <span className={cn('inline-block h-2 w-2 rounded-full', CATEGORY_DOT[cat])} />
              <span>
                {t(labelKeyFor(dimension, cat))} ×{b.recipients.length}
              </span>
            </div>
            <div className="ml-3.5 space-y-0.5">
              {b.recipients.map((r, i) => (
                <div key={r} className="text-xs text-muted-foreground break-all">
                  {r}
                  {b.details[i]?.reason ? (
                    <span className="ml-1 text-muted-foreground/60">({b.details[i].reason})</span>
                  ) : null}
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
