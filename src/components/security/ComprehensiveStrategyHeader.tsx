'use client';

// ComprehensiveStrategyHeader — page-level enable/disable strip for stage5
// ("综合策略") drawer content, per html_spec/filter-rules-pipeline-advanced-rules
// §3.1 "页级策略开关": white bar "{策略名} 已启用/已禁用 [Switch]" sitting above
// whichever stage5 policy is currently selected in PolicyPipelinePage. The
// Switch is wired to the comprehensive_strategy aggregate module: it gates
// every stage5 member without overwriting each member's own switch state.
// Toggling takes effect immediately — a deliberate simplification vs. the
// demo's draft/pending state (see PolicyPipelinePage.tsx stage5 wiring).

import { useTranslations } from 'next-intl';
import { Switch } from '@/components/ui/switch';

export interface ComprehensiveStrategyHeaderProps {
  policyName: string;
  enabled: boolean;
  onToggle: (next: boolean) => void;
  loading?: boolean;
  disabled?: boolean;
}

export function ComprehensiveStrategyHeader({
  policyName,
  enabled,
  onToggle,
  loading = false,
  disabled = false,
}: ComprehensiveStrategyHeaderProps) {
  const t = useTranslations('pipeline');

  return (
    <div
      data-testid="comprehensive-strategy-header"
      className="flex items-center justify-between rounded-lg border border-border/70 bg-background px-4 py-3 shadow-sm"
    >
      <span className="text-sm font-medium text-foreground">
        {policyName} {enabled ? t('comprehensiveEnabled') : t('comprehensiveDisabled')}
      </span>
      <Switch
        data-testid="comprehensive-strategy-header-switch"
        checked={enabled}
        disabled={disabled || loading}
        onCheckedChange={onToggle}
      />
    </div>
  );
}
