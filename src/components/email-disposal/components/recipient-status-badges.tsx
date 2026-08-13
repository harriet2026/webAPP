// recipient-status-badges.tsx — 单一"主要类别"Badge + hover 明细。
//
// 背景（GT-12923 阶段五 UI 复盘）：早期版本对 mixed 邮件的每个处置类别都渲染
// 一个独立 Badge（如 [投递 6][旁路 1][隔离 1]），多类别时会撑高行高、多种
// 类别色同屏叠加，视觉比普通行"花"且占地更大。改为只渲染 1 个 Badge：
//   - 挑出一个"主要类别"展示为 [类别 人数]，其余类别折叠成同一 Badge 尾部
//     的中性灰 "+N"（N = 其他类别数），hover 展开完整逐收件人明细 tooltip。
//   - 高度/密度与普通行（单一类别）完全一致，颜色数量始终只有 1 种类别色。
//
// "主要类别"怎么选（见 pickPrimaryBucket）：
//   - 当前"执行动作"筛选生效时（highlightKeys 非空）：优先展示命中筛选值
//     的类别。否则会出现"筛选投递却看到隔离"的表面矛盾——用户筛"投递"命中
//     这封 mixed 邮件，正是因为它含有投递收件人，即使投递只占 1 人、隔离占
//     5 人，也必须展示"投递"，不能因为数量少就被隔离抢占主 Badge。
//   - 未筛选时（默认列表态）：按业务风险优先级选（还需要人工处理/关注的类
//     别优先于已成功投递的终态），让运营人员刷列表时第一眼看到风险信号。
//
// 两个维度：
//   - 执行动作列（dimension='action'）：按 final_action 聚类，支持 highlightKeys
//   - 邮件状态列（dimension='status'）：按投递 status 聚类，不接收 highlightKeys
//     （状态筛选与本文件的高亮机制不是同一语义轴，始终走风险优先级默认规则）

import { useMemo } from 'react';
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { useTranslations } from 'next-intl';
import { cn } from '@/lib/utils';
import { normalizeRawActionToExecutionAction } from '@/lib/email-log-action';
import type { RecipientDisposition } from '@/types/phishing-detection';

export type Dimension = 'action' | 'status';
export type Category = 'delivered' | 'quarantine' | 'rejected' | 'sideline' | 'discarded' | 'audit' | 'other';

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

// 默认（无筛选）态下选"主要类别"用的风险优先级：越小越先展示。
// 排序思路：还需要人工判断/处理的类别（隔离/审核/旁路排队中）排在最前，
// 已经走到终态的类别（拒绝/丢弃/投递成功）排在后面——运营人员刷列表时，
// 第一眼应该看到"这条记录里有没有还悬而未决的收件人"，而不是被数量占多数
// 但价值最低的"投递成功"占据主 Badge 位置。这是一个可调整的业务判断，不是
// 唯一正确答案，如果实际运营场景对优先级有不同诉求，调整这个表即可。
const RISK_PRIORITY: Record<Category, number> = {
  quarantine: 0,
  audit: 1,
  sideline: 2,
  rejected: 3,
  discarded: 4,
  delivered: 5,
  other: 6,
};

/**
 * 从多个 bucket 里选出用来渲染"主要类别"Badge 的那一个。
 *
 * - highlightKeys 非空（"执行动作"筛选生效）时：只在命中筛选值的 bucket 里
 *   选，取人数最多的一个。这保证了"筛的是投递，展示的主 Badge 也一定是
 *   投递"，不会出现表面对不上的疑惑。如果筛选值一个都没命中（理论上不该
 *   发生，因为后端已经是交集匹配才会返回这条记录），退回默认风险优先级。
 * - 否则按 RISK_PRIORITY 从小到大选，同优先级内人数多的优先。
 */
export function pickPrimaryBucket<T extends { key: string; recipients: string[] }>(
  buckets: T[],
  toCat: (key: string) => Category,
  highlightKeys?: string[],
): T {
  if (highlightKeys?.length) {
    const matched = buckets.filter((b) => isBucketHighlighted(b.key, highlightKeys));
    if (matched.length > 0) {
      return matched.reduce((best, b) => (b.recipients.length > best.recipients.length ? b : best));
    }
  }
  const sorted = [...buckets].sort((a, b) => {
    const ra = RISK_PRIORITY[toCat(a.key)] ?? 99;
    const rb = RISK_PRIORITY[toCat(b.key)] ?? 99;
    if (ra !== rb) return ra - rb;
    return b.recipients.length - a.recipients.length;
  });
  // 调用方保证 buckets 非空（渲染侧只在多 bucket 分支调用）。
  return sorted[0]!;
}

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

/**
 * 取指定维度的标签 key。
 * GT-12923 阶段五（任务20）：CSV 导出的收件人级明细列复用这个函数，确保
 * 列表页徽章、详情抽屉、CSV 导出三处对同一个动作值展示的文案永远一致——
 * 不需要在 csv-export.ts 里再维护一份重复的 category→labelKey 映射。
 */
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

// GT-12923 阶段四：判断某个 bucket（bucket.key 是原始动作值，如 'accept'）
// 是否命中"执行动作"筛选值（EXECUTION_ACTIONS 词表，如 'deliver'）。抽成
// 纯函数导出，便于单测覆盖归一化 + 高亮判定，不依赖组件渲染。
export function isBucketHighlighted(bucketKey: string, highlightKeys: string[] | undefined): boolean {
  return !!highlightKeys?.length && highlightKeys.includes(normalizeRawActionToExecutionAction(bucketKey));
}

// 命中筛选值的桶置顶，未命中的桶维持原有的 CATEGORY_ORDER 相对顺序
// （Array.prototype.sort 是稳定排序，只要比较函数只在"命中/未命中"两档
// 之间返回 0/非 0，同档内的原始顺序就会被保留）。highlightKeys 为空/未
// 传时原样返回，不做任何重排。
export function sortBucketsByHighlight<T extends { key: string }>(
  buckets: T[],
  highlightKeys: string[] | undefined,
): T[] {
  if (!highlightKeys?.length) return buckets;
  return [...buckets].sort((a, b) => {
    const ah = isBucketHighlighted(a.key, highlightKeys) ? 0 : 1;
    const bh = isBucketHighlighted(b.key, highlightKeys) ? 0 : 1;
    return ah - bh;
  });
}

interface RecipientStatusBadgesProps {
  dispositions: RecipientDisposition[];
  dimension?: Dimension;
  // GT-12923 阶段四：搜索栏"执行动作"筛选生效时，命中的收件人徽章需要突出
  // 显示（否则用户只会看到 [投递 4][隔离 1] 却不知道为什么这封 mixed 邮件
  // 出现在"隔离"筛选结果里）。传入归一化后的筛选值（EXECUTION_ACTIONS 词
  // 表，如 ['quarantine']）；仅在 dimension='action' 时生效——status 维��
  // 走的是完全不同的一套状态词表，与"执行动作"筛选不是同一个语义轴，传
  // 了也不会产生任何高亮（bucket.key 是原始动作值，不是 displayStatus）。
  highlightKeys?: string[];
}

export function RecipientStatusBadges({ dispositions, dimension = 'action', highlightKeys }: RecipientStatusBadgesProps) {
  const t = useTranslations('emailDisposal');
  const toCat = dimension === 'action' ? actionCategory : statusCategory;

  const buckets = useMemo(
    () => sortBucketsByHighlight(bucketRecipients(dispositions, dimension), highlightKeys),
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

  // 多桶 → 只渲染 1 个 Badge：挑出"主要类别"展示 [类别 人数]，其余类别折叠
  // 成同一 Badge 尾部的中性灰 "+N"（N = 其他类别数，不区分具体是谁）。
  // 高度/密度与单桶完全一致，颜色数量始终只有 1 种类别色，hover 展开完整
  // 逐收件人明细（主要类别对应的那一行用浅底色标出，呼应 Badge 上的数字）。
  const primary = pickPrimaryBucket(buckets, toCat, highlightKeys);
  const primaryCat = toCat(primary.key);
  const otherCategoryCount = buckets.length - 1;

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger render={<span className="inline-flex" />}>
          <Badge variant={CATEGORY_VARIANT[primaryCat]} className="gap-1 border-current/30">
            <span className={cn('inline-block h-1.5 w-1.5 rounded-full', CATEGORY_DOT[primaryCat])} />
            <span className={CATEGORY_TEXT[primaryCat]}>
              {t(labelKeyFor(dimension, primaryCat))} {primary.recipients.length}
            </span>
            {otherCategoryCount > 0 && (
              <span className="font-normal text-muted-foreground/70">+{otherCategoryCount}</span>
            )}
          </Badge>
        </TooltipTrigger>
        <TooltipContent side="top" className="max-w-md">
          <RecipientTooltipBody buckets={buckets} toCat={toCat} dimension={dimension} primaryKey={primary.key} />
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
  // 与 Badge 上展示的数字对应的那个 bucket，用浅底色标出，帮助用户把
  // "Badge 里的数字"和"明细里的哪一行"对上，不需要额外文案。
  primaryKey?: string;
}) {
  const t = useTranslations('emailDisposal');
  return (
    <div className="space-y-1.5">
      {buckets.map((b) => {
        const cat = toCat(b.key);
        const isPrimary = b.key === primaryKey;
        return (
          <div
            key={b.key}
            className={cn('space-y-0.5 rounded-sm', isPrimary && '-mx-1.5 bg-muted/60 px-1.5 py-1')}
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
