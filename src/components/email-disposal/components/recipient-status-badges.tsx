// recipient-status-badges.tsx — 方案 C（Badge 化）：逐收件人粒度的多 Badge 展示。
//
// mixed 邮件的收件人被拆分成不同处置时，不再用迷你色条（色条在表格中行高突兀、
// 圆角/字号与标准 Badge 不统一）。改为每个处置类别渲染一个标准 Badge，
// Badge 内显示"类别 · 人数"。例如 [投递 4] [隔离 1]。
// hover 展开逐收件人明细 tooltip。
//
// 两个维度：
//   - 执行动作列（dimension='action'）：按 final_action 聚类
//   - 邮件状态列（dimension='status'）：按投递 status 聚类

import { useMemo } from 'react';
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { useTranslations } from 'next-intl';
import { cn } from '@/lib/utils';
import type { RecipientDisposition } from '@/types/phishing-detection';

type Dimension = 'action' | 'status';
type Category = 'delivered' | 'quarantine' | 'rejected' | 'sideline' | 'discarded' | 'audit' | 'other';

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
  delivering: 'delivered',
  in_delivery: 'delivered',
  quarantined: 'quarantine',
  sidelined: 'sideline',
  pending: 'sideline',
  reinjected: 'delivered',
  rejected: 'rejected',
  bounced: 'rejected',
  discarded: 'discarded',
  failed: 'rejected',
  cancelled: 'discarded',
  audited: 'audit',
};

export function statusCategory(status: string): Category {
  return STATUS_CATEGORY[(status || '').toLowerCase()] ?? 'other';
}

const CATEGORY_ORDER: Record<Category, number> = {
  delivered: 0,
  sideline: 1,
  audit: 2,
  quarantine: 3,
  discarded: 4,
  rejected: 5,
  other: 6,
};

/** Badge variant：统一用 outline（轻量边框），靠圆点+文字颜色区分语义。
 *  避免深实底色(default)与浅色(destructive/secondary)并排时视觉重量不平衡。 */
const CATEGORY_VARIANT: Record<Category, 'outline'> = {
  delivered: 'outline',
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
  sideline: 'filters.statuses.sideline_pending',
  quarantine: 'filters.statuses.quarantine_pending',
  rejected: 'filters.statuses.rejected',
  discarded: 'filters.statuses.discarded',
  audit: 'filters.statuses.audit_pending',
  other: 'recipientStatusBar.other',
};

/** 取指定维度的标签 key。 */
function labelKeyFor(dim: Dimension, cat: Category): string {
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
}

export function RecipientStatusBadges({ dispositions, dimension = 'action' }: RecipientStatusBadgesProps) {
  const t = useTranslations('emailDisposal');
  const toCat = dimension === 'action' ? actionCategory : statusCategory;
  const buckets = useMemo(() => bucketRecipients(dispositions, dimension), [dispositions, dimension]);

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

  // 多桶 → 多个 Badge 排列，每个带人数
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger render={<div className="flex flex-wrap items-center gap-1" />}>
          {buckets.map((b) => {
            const cat = toCat(b.key);
            return (
              <Badge key={b.key} variant={CATEGORY_VARIANT[cat]} className="gap-1 border-current/30">
                <span className={cn('inline-block h-1.5 w-1.5 rounded-full', CATEGORY_DOT[cat])} />
                <span className={CATEGORY_TEXT[cat]}>{t(labelKeyFor(dimension, cat))} {b.recipients.length}</span>
              </Badge>
            );
          })}
        </TooltipTrigger>
        <TooltipContent side="top" className="max-w-md">
          <RecipientTooltipBody buckets={buckets} toCat={toCat} dimension={dimension} />
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

function RecipientTooltipBody({
  buckets,
  toCat,
  dimension,
}: {
  buckets: RcptStatusBucket[];
  toCat: (key: string) => Category;
  dimension: Dimension;
}) {
  const t = useTranslations('emailDisposal');
  return (
    <div className="space-y-1.5">
      {buckets.map((b) => {
        const cat = toCat(b.key);
        return (
          <div key={b.key} className="space-y-0.5">
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
