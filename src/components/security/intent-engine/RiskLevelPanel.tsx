'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import type { IntentRiskLevel, IntentType, IntentDirection, IntentSingleConfig } from '@/types/intent-engine';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { ChevronRight } from 'lucide-react';
import { usePointerHover } from '@/hooks/use-pointer-hover';
import { cn } from '@/lib/utils';
import { IntentCard } from './IntentCard';

interface RiskLevelPanelProps {
  level: IntentRiskLevel;
  intents: IntentType[];
  direction: IntentDirection;
  config: Record<IntentType, IntentSingleConfig>;
  engineEnabled: boolean;
  expandedIntent: IntentType | null;
  onExpand: (intent: IntentType | null) => void;
  onChange: (intent: IntentType, next: IntentSingleConfig) => void;
  defaultOpen?: boolean;
}

// 面板头配色 token（与 IntentCard 的 RISK_STYLES 家族一致；高危红 / 中危黄 / 低危蓝）
const PANEL_STYLES: Record<IntentRiskLevel, { text: string; bg: string }> = {
  high: { text: 'text-destructive', bg: 'bg-destructive/5 dark:bg-destructive/10' },
  medium: { text: 'text-warning', bg: 'bg-warning/10 dark:bg-warning/15' },
  low: { text: 'text-info', bg: 'bg-info/10 dark:bg-info/15' },
};

export function RiskLevelPanel({
  level,
  intents,
  direction,
  config,
  engineEnabled,
  expandedIntent,
  onExpand,
  onChange,
  defaultOpen,
}: RiskLevelPanelProps) {
  const t = useTranslations('intentEngine.panel');
  const [open, setOpen] = useState(defaultOpen ?? false);
  // 面板头（可点击折叠区）pointer 驱动 hover（柔和交互反馈规格 §6.5/§7.2）。
  const { pointerHoverProps } = usePointerHover<HTMLButtonElement>();

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger
        data-testid={`ie-panel-${level}`}
        className={cn(
          'w-full flex items-center justify-between p-4 cursor-pointer rounded-lg border outline-none',
          'transition-[background-color] duration-[180ms] ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none',
          'focus-visible:ring-2 focus-visible:ring-ring/60 focus-visible:ring-inset',
          open ? PANEL_STYLES[level].bg : 'bg-card data-[hovered=true]:bg-muted/50',
        )}
        {...pointerHoverProps}
      >
        <span className="flex items-center gap-3">
          {/* 规格 §6.5：展开指示用同一 Chevron 节点旋转，不交换两个图标节点。 */}
          <ChevronRight
            className={cn(
              'h-5 w-5 transition-transform duration-[240ms] ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none',
              open && 'rotate-90',
              PANEL_STYLES[level].text,
            )}
          />
          <span className={cn('font-semibold', PANEL_STYLES[level].text)}>{t(level)}</span>
          <span className="text-sm text-muted-foreground">{t('count', { n: intents.length })}</span>
        </span>
        <span className="text-xs text-muted-foreground">{t(`${level}Desc` as 'highDesc', { n: intents.length })}</span>
      </CollapsibleTrigger>
      <CollapsibleContent className="space-y-3 pt-3">
        {intents.map((intent) => (
          <IntentCard
            key={intent}
            intent={intent}
            direction={direction}
            value={config[intent]}
            expanded={expandedIntent === intent}
            engineEnabled={engineEnabled}
            onToggleExpand={() => onExpand(expandedIntent === intent ? null : intent)}
            onChange={(next) => onChange(intent, next)}
          />
        ))}
      </CollapsibleContent>
    </Collapsible>
  );
}
