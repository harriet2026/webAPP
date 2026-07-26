'use client';

import { useTranslations } from 'next-intl';
import { FileText, Plus } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { ConditionGroups, ConditionLeaf } from './serde';
import { summarizeLeaf, buildExpressionText, type LeafSummary } from './expression';

// ExpressionPreview.tsx — layer-3-conditions.html 右栏：逻辑表达式预览。
// 纯展示组件，所有折叠(+N)/配置不完整/NOT/信封原始标识的计算都委托给
// expression.ts 的 summarizeLeaf（单一数据源，供 expression.test.ts 直接
// 单测），本文件只负责按结构着色渲染 + 拼接底部完整表达式 mono 块。

interface Props {
  groups: ConditionGroups;
}

export function ExpressionPreview({ groups }: Props) {
  const t = useTranslations('advancedRulesFeature');
  const isEmpty = groups.any.length === 0 && groups.all.length === 0;
  const exprText = buildExpressionText(groups, t);

  return (
    <div className="flex h-full flex-col text-[12.5px]" data-testid="expression-preview">
      <div className="mb-2.5 flex items-center gap-1.5 text-[13px] font-semibold">
        <FileText className="h-3.5 w-3.5" />
        {t('v3Conditions.previewTitle')}
      </div>

      {isEmpty ? (
        <div className="mt-16 flex flex-col items-center gap-1 text-center text-muted-foreground" data-testid="expression-preview-empty">
          <Plus className="h-4 w-4" />
          <span>{t('v3Conditions.previewEmptyHint')}</span>
        </div>
      ) : (
        <div className="flex-1 space-y-2 overflow-y-auto">
          {groups.any.length > 0 && (
            <GroupCard kind="any" leaves={groups.any} t={t} />
          )}
          {groups.any.length > 0 && groups.all.length > 0 && (
            <div className="text-center">
              <span className="rounded bg-muted px-2.5 py-0.5 text-[11px] font-bold" data-testid="preview-and-connector">
                {t('v3Conditions.previewAndConnector')}
              </span>
            </div>
          )}
          {groups.all.length > 0 && (
            <GroupCard kind="all" leaves={groups.all} t={t} />
          )}
        </div>
      )}

      <div className="mt-3 border-t pt-2" data-testid="expression-full-block">
        <div className="mb-1 text-[11.5px] text-muted-foreground">{t('v3Conditions.previewFullExpressionTitle')}</div>
        <pre className="whitespace-pre-wrap break-all rounded-md border bg-muted/40 p-2 font-mono text-[11.5px]" data-testid="expression-text">
          {exprText}
        </pre>
      </div>
    </div>
  );
}

function GroupCard({ kind, leaves, t }: { kind: 'any' | 'all'; leaves: ConditionLeaf[]; t: (k: string, v?: Record<string, string | number>) => string }) {
  const isOr = kind === 'any';
  return (
    <div
      className={cn(
        'rounded-lg border p-2.5',
        isOr ? 'border-blue-200 bg-blue-50 dark:border-blue-900 dark:bg-blue-950/20' : 'border-green-200 bg-green-50 dark:border-green-900 dark:bg-green-950/20',
      )}
      data-testid={`preview-group-${kind}`}
    >
      <div
        className={cn('mb-1.5 flex items-center gap-1.5 text-[11.5px] font-semibold', isOr ? 'text-blue-700 dark:text-blue-300' : 'text-green-700 dark:text-green-300')}
        title={isOr ? t('v3Conditions.previewOrGroupTooltip') : t('v3Conditions.previewAndGroupTooltip')}
      >
        <span className={cn('h-2 w-2 rounded-full', isOr ? 'bg-blue-500' : 'bg-green-500')} />
        {isOr ? t('v3Conditions.previewOrGroupTitle') : t('v3Conditions.previewAndGroupTitle')}
        <span
          className={cn(
            'ml-1 rounded-full border px-1.5 text-[10px] font-normal',
            isOr ? 'border-blue-300 text-blue-600' : 'border-green-300 text-green-600',
          )}
        >
          {leaves.length}
        </span>
      </div>
      <div className={cn('space-y-1 border-l-2 pl-2', isOr ? 'border-blue-200' : 'border-green-200')}>
        {leaves.map((leaf, i) => (
          <LeafRow key={leaf.id} leaf={leaf} connector={isOr ? 'OR' : 'AND'} last={i === leaves.length - 1} t={t} />
        ))}
      </div>
    </div>
  );
}

function LeafRow({
  leaf,
  connector,
  last,
  t,
}: {
  leaf: ConditionLeaf;
  connector: string;
  last: boolean;
  t: (k: string, v?: Record<string, string | number>) => string;
}) {
  const s: LeafSummary = summarizeLeaf(leaf, t);
  return (
    <div data-testid="preview-leaf">
      <div className="flex flex-wrap items-center gap-1">
        <span className="font-medium">{s.name}</span>
        <span className="text-blue-600 dark:text-blue-400">{s.operatorLabel}</span>
        {s.incomplete ? (
          <span className="text-amber-600 dark:text-amber-400" data-testid="preview-incomplete">
            {t('incompleteCondition')}
          </span>
        ) : (
          <span className="font-mono">
            {s.values.map((v) => `"${v}"`).join(', ')}
            {s.foldedCount > 0 && <span className="text-muted-foreground"> +{s.foldedCount}</span>}
          </span>
        )}
        {s.exclude && (
          <span className="text-amber-600 dark:text-amber-400" data-testid="preview-not-marker">
            {t('v3Conditions.notMarker')}
          </span>
        )}
      </div>
      {!last && <div className={cn('py-0.5 text-[11px]', connector === 'OR' ? 'text-blue-500' : 'text-green-600')}>{connector}</div>}
    </div>
  );
}
