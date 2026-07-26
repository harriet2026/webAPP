'use client';

import { useTranslations } from 'next-intl';
import { Activity, AlertTriangle, Clock, Info, RotateCcw, TrendingUp } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import type { ThreatRetroStats } from '@/types/threat-retro';

interface Props {
  stats?: ThreatRetroStats;
  isLoading?: boolean;
  activeKpi: string | null;
  onToggle: (key: string) => void;
}

interface CardProps {
  label: string;
  hint: string;
  value: string | number | null;
  icon: React.ReactNode;
  tone?: 'red' | 'orange' | 'green';
  clickable?: boolean;
  active?: boolean;
  onClick?: () => void;
  isLoading?: boolean;
  testId?: string;
}

function Card({
  label,
  hint,
  value,
  icon,
  tone,
  clickable,
  active,
  onClick,
  isLoading,
  testId,
}: CardProps) {
  const toneCls =
    tone === 'red'
      ? 'text-rose-600'
      : tone === 'orange'
        ? 'text-amber-600'
        : tone === 'green'
          ? 'text-emerald-600'
          : 'text-foreground';
  const display = value === null || value === undefined ? '—' : value;
  const inner = (
    <>
      <div className="flex items-center justify-between">
        <span className="flex items-center gap-1 text-sm text-muted-foreground">
          {label}
          <Tooltip>
            <TooltipTrigger
              aria-label={hint}
              render={<Info tabIndex={0} className="h-3.5 w-3.5 cursor-help" />}
            />
            <TooltipContent className="max-w-xs text-xs">{hint}</TooltipContent>
          </Tooltip>
        </span>
        <span className="text-muted-foreground/80">{icon}</span>
      </div>
      <div className={cn('mt-2 text-2xl font-semibold tabular-nums', toneCls)}>
        {isLoading ? (
          <span className="inline-block h-7 w-16 animate-pulse rounded-md bg-muted" />
        ) : (
          display
        )}
      </div>
    </>
  );
  if (clickable) {
    return (
      <button
        type="button"
        data-testid={testId}
        onClick={onClick}
        className={cn(
          'w-full rounded-lg border bg-card p-4 text-left shadow-sm transition-colors hover:bg-accent/40',
          active ? 'border-primary ring-1 ring-primary/30' : 'border-border/70',
        )}
      >
        {inner}
      </button>
    );
  }
  return (
    <div
      data-testid={testId}
      className="rounded-lg border border-border/70 bg-card p-4 shadow-sm"
    >
      {inner}
    </div>
  );
}

export function KpiCards({ stats, isLoading, activeKpi, onToggle }: Props) {
  const t = useTranslations('threatRetro.kpi');
  // detection_rate is a 0..1 float (internal/storage.ThreatRetroStats).
  const ratePct = stats?.range.detection_rate;
  const rateDisplay =
    ratePct === null || ratePct === undefined || Number.isNaN(ratePct)
      ? null
      : `${Math.round(ratePct * 100)}%`;
  return (
    <TooltipProvider>
    <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
      <Card
        label={t('runningTasks')}
        hint={t('hint.snapshot')}
        value={stats?.snapshot.in_progress ?? null}
        icon={<Activity className="h-4 w-4" />}
        isLoading={isLoading}
        clickable
        active={activeKpi === 'running'}
        onClick={() => onToggle('running')}
        testId="threat-retro-kpi-running"
      />
      <Card
        label={t('totalLeaks')}
        hint={t('hint.range')}
        value={stats?.range.leaks_found ?? null}
        tone="red"
        icon={<AlertTriangle className="h-4 w-4" />}
        isLoading={isLoading}
        clickable
        active={activeKpi === 'leaks'}
        onClick={() => onToggle('leaks')}
        testId="threat-retro-kpi-leak-total"
      />
      <Card
        label={t('pendingRecall')}
        hint={t('hint.snapshot')}
        value={stats?.snapshot.pending_recall ?? null}
        tone="orange"
        icon={<Clock className="h-4 w-4" />}
        isLoading={isLoading}
        clickable
        active={activeKpi === 'pending'}
        onClick={() => onToggle('pending')}
        testId="threat-retro-kpi-pending"
      />
      <Card
        label={t('recallSucceeded')}
        hint={t('hint.recallSuccess')}
        value={stats?.range.recall_succeeded ?? null}
        tone="green"
        icon={<RotateCcw className="h-4 w-4" />}
        isLoading={isLoading}
        clickable
        active={activeKpi === 'recalled'}
        onClick={() => onToggle('recalled')}
        testId="threat-retro-kpi-recalled"
      />
      <Card
        label={t('recallFailed')}
        hint={t('hint.recallFailure')}
        value={stats?.range.recall_failed ?? null}
        tone="red"
        icon={<AlertTriangle className="h-4 w-4" />}
        isLoading={isLoading}
        clickable
        active={activeKpi === 'failed'}
        onClick={() => onToggle('failed')}
        testId="threat-retro-kpi-recall-failed"
      />
      <Card
        label={t('leakRate')}
        hint={t('hint.rate')}
        value={rateDisplay}
        tone="green"
        icon={<TrendingUp className="h-4 w-4" />}
        isLoading={isLoading}
		clickable
		active={activeKpi === 'rate'}
		onClick={() => onToggle('rate')}
        testId="threat-retro-kpi-rate"
      />
    </div>
    </TooltipProvider>
  );
}
