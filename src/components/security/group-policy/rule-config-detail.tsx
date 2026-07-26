'use client';

import { useTranslations } from 'next-intl';
import { Info } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import type { GroupPolicyRule, PolicyStatus } from '@/types/group-policy';
import { visibleStages, stageNumberOf } from './stage-policies';

// 策略配置状态徽标配色（demo statusBadgeStyle：禁用琥珀 / 自定义紫 / 其余蓝）
export const STATUS_BADGE_COLOR: Record<PolicyStatus, string> = {
  disable: 'bg-amber-50 text-amber-600 dark:bg-amber-950 dark:text-amber-300',
  custom: 'bg-violet-50 text-violet-700 dark:bg-violet-950 dark:text-violet-300',
  enable: 'bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-300',
  inherit: 'bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-300',
};

// 策略配置详情（demo RuleConfigDetail）：按阶段流水线展示该规则在每个模块的
// 配置——灰色为「继承全局」，彩色徽标为「另行配置」（状态·摘要）。
export function RuleConfigDetail({ rule, aiEnabled }: { rule: GroupPolicyRule; aiEnabled: boolean }) {
  const t = useTranslations();
  const tGp = useTranslations('groupPolicy');
  const stages = visibleStages(aiEnabled);
  return (
    <div className="p-4 space-y-3" data-testid={`group-policy-rule-detail-${rule.id}`}>
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <Info className="h-3.5 w-3.5 shrink-0" />
        {tGp('configDetailHint')}
      </div>
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {stages.map((stage) => (
          <div key={stage.key} className="rounded-lg border bg-background overflow-hidden">
            <div className="px-3 py-2 border-b bg-muted/40 text-xs font-medium">
              {tGp(`stages.${stage.key}`)}
            </div>
            <div className="p-2 space-y-0.5">
              {stage.policies.map((mod) => {
                const entry = rule.stagePolicies?.[mod.key];
                const configured = entry != null && entry.status !== 'inherit';
                return (
                  <div key={mod.key} className="flex items-start justify-between gap-2 px-2 py-1.5 rounded text-xs">
                    <span className={configured ? 'font-medium' : 'text-muted-foreground'}>{t(mod.nameKey)}</span>
                    <div className="flex flex-col items-end gap-0.5 shrink-0">
                      {!configured ? (
                        <span className="text-muted-foreground">{tGp('policyStatus.inherit')}</span>
                      ) : (
                        <Badge variant="secondary" className={`text-[11px] ${STATUS_BADGE_COLOR[entry.status]}`}>
                          {tGp(`policyStatus.${entry.status}`)}
                          {entry.summary ? `·${entry.summary}` : ''}
                        </Badge>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// 由 policyKey 反查其所属阶段号（表格「策略配置」列的【阶段N】前缀）
export function stageNumberForPolicy(policyKey: string): number {
  for (const stage of visibleStages(true)) {
    if (stage.policies.some((p) => p.key === policyKey)) return stageNumberOf(stage.key);
  }
  return 0;
}
