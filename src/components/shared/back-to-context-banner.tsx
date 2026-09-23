'use client';

import { ArrowLeft, Info } from 'lucide-react';

import { Button } from '@/components/ui/button';

interface BackToContextBannerProps {
  /** 前缀文案，如"来自规则效能统计：" */
  label: string;
  /** 具体上下文展示文本，如策略/智能体名称 */
  contextText: string;
  /** 返回按钮文案 */
  backLabel: string;
  onBack: () => void;
  'data-testid'?: string;
}

/**
 * 通用的"来源上下文 + 返回"提示条，供从规则效能统计跳转过来的目标页面复用，
 * 保持与邮件处置中心侧同名提示条一致的视觉与交互（RuleEffectivenessContextBanner）。
 * 仅做展示，不读取/不影响所在页面自身的筛选与查询状态。
 */
export function BackToContextBanner({
  label,
  contextText,
  backLabel,
  onBack,
  'data-testid': testId,
}: BackToContextBannerProps) {
  return (
    <div
      data-testid={testId}
      className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-primary/20 bg-primary/5 px-4 py-2.5 text-sm text-foreground"
    >
      <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
        <Info className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
        <span className="text-muted-foreground">{label}</span>
        <span className="font-medium">{contextText}</span>
      </div>
      <Button
        variant="ghost"
        size="sm"
        className="shrink-0 gap-1.5"
        onClick={onBack}
        data-testid={testId ? `${testId}-back` : undefined}
      >
        <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        {backLabel}
      </Button>
    </div>
  );
}
