'use client';

import { useTranslations } from 'next-intl';
import { Badge } from '@/components/ui/badge';
import { Settings } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { PolicyDef } from './stage-policies';
import type { PolicyStatus } from '@/types/group-policy';

// 中栏画布策略卡的状态视觉（demo renderPolicyCard）：
// 左色条 禁用红 / 自定义紫 / 启用·继承蓝；状态 Badge 同色族 outline。
// 注：状态单选不在卡内 —— 点击卡片在右栏 PolicyConfigPanel 打开四档配置
// （custom 档按 D1 置灰「敬请期待」，runtime/validator 本迭代不接受 custom）。
const CARD_BORDER: Record<PolicyStatus, string> = {
  disable: 'border-l-red-500',
  custom: 'border-l-violet-600',
  enable: 'border-l-blue-500',
  inherit: 'border-l-blue-500',
};

const CARD_STATE_BADGE: Record<PolicyStatus, string> = {
  disable: 'bg-red-50 text-red-500 border-red-200 dark:bg-red-950 dark:text-red-300 dark:border-red-900',
  custom: 'bg-violet-50 text-violet-700 border-violet-200 dark:bg-violet-950 dark:text-violet-300 dark:border-violet-900',
  enable: 'bg-blue-50 text-blue-600 border-blue-200 dark:bg-blue-950 dark:text-blue-300 dark:border-blue-900',
  inherit: 'bg-blue-50 text-blue-600 border-blue-200 dark:bg-blue-950 dark:text-blue-300 dark:border-blue-900',
};

export interface StagePolicyCardProps {
  def: PolicyDef;
  status: PolicyStatus;
  selected: boolean;
  onClick: () => void;
}

// 五阶段画布上的可点击策略卡（demo renderPolicyCard）：点击在右栏打开配置详情。
export function StagePolicyCard({ def, status, selected, onClick }: StagePolicyCardProps) {
  const t = useTranslations();
  const tGp = useTranslations('groupPolicy');

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick(); } }}
      className={cn(
        'p-3 rounded-lg border border-l-4 cursor-pointer transition-all bg-card',
        CARD_BORDER[status],
        selected && 'ring-2 ring-blue-500 bg-blue-50/60 dark:bg-blue-950/40',
      )}
      data-testid={`group-policy-card-${def.key}`}
      aria-pressed={selected}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 min-w-0">
          <Settings className="h-4 w-4 text-muted-foreground shrink-0" />
          <span className="text-sm font-medium truncate">{t(def.nameKey)}</span>
        </div>
        {status === 'disable' && <span className="text-red-500 shrink-0">✕</span>}
      </div>
      <div className="flex items-center gap-1.5 mt-1 flex-wrap">
        <Badge variant="outline" className={cn('text-xs', CARD_STATE_BADGE[status])}>
          {tGp(`policyStatusShort.${status}`)}
        </Badge>
        {def.isHighRisk && (
          <Badge variant="outline" className="text-[10px] bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950 dark:text-amber-300 dark:border-amber-800">
            {tGp('highRisk')}
          </Badge>
        )}
        {def.reserved && (
          <Badge variant="outline" className="text-[10px] bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950 dark:text-amber-300 dark:border-amber-800">
            {tGp('reserved')}
          </Badge>
        )}
      </div>
    </div>
  );
}
