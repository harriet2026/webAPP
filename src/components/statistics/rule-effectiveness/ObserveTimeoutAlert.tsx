'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { OBSERVE_TIMEOUT_DAYS, strategyPathLabels } from './constants';
import { StrategyPathBreadcrumb } from './StrategyPathBreadcrumb';
import type { RuleEffectivenessRow } from '@/lib/api/rule-effectiveness';

interface Props {
  rows: RuleEffectivenessRow[];
  onNavigateToConfig: (row: RuleEffectivenessRow) => void;
}

/**
 * 超时观察告警条：当存在观察时长超过阈值且命中不为 0 的对象时展示提醒——
 * 视觉与交互模式对齐安全总览的 EscapesAlert（浅琥珀色底 + AlertTriangle 图标）。
 */
export function ObserveTimeoutAlert({ rows, onNavigateToConfig }: Props) {
  const t = useTranslations('ruleEffectiveness.timeoutAlert');
  const tPath = useTranslations('ruleEffectiveness.path');
  const [open, setOpen] = useState(false);

  const timeoutRows = rows.filter((r) => r.observed_days > OBSERVE_TIMEOUT_DAYS && r.hits > 0);
  if (timeoutRows.length === 0) return null;

  return (
    <>
      <div
        className="flex flex-wrap items-center gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 dark:border-amber-900/50 dark:bg-amber-950/30"
        data-testid="rule-effectiveness-timeout-alert"
      >
        <AlertTriangle className="h-4 w-4 text-amber-600" />
        <span className="text-sm text-amber-800 dark:text-amber-300">
          {t('warning', { count: timeoutRows.length, days: OBSERVE_TIMEOUT_DAYS })}
        </span>
        <Button variant="outline" size="sm" className="ml-auto" onClick={() => setOpen(true)}>
          {t('viewDetails')}
        </Button>
      </div>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent className="flex w-[640px] flex-col p-0 sm:max-w-[640px]">
          <SheetHeader className="shrink-0 border-b border-border px-6 py-4">
            <SheetTitle>{t('drawerTitle')}</SheetTitle>
          </SheetHeader>
          <div className="flex-1 space-y-3 overflow-y-auto px-6 py-4">
            {timeoutRows.map((row) => (
              <div key={row.id} className="rounded-lg border border-border/60 p-3 text-sm">
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0 truncate">
                    <StrategyPathBreadcrumb segments={strategyPathLabels(row, tPath)} />
                  </div>
                  <Button variant="outline" size="sm" onClick={() => onNavigateToConfig(row)}>
                    {t('goToConfig')}
                  </Button>
                </div>
                <div className="mt-2 grid grid-cols-2 gap-y-1 text-muted-foreground">
                  <span>{t('observedDays', { days: row.observed_days })}</span>
                  <span>{t('hits', { count: row.hits })}</span>
                </div>
              </div>
            ))}
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
