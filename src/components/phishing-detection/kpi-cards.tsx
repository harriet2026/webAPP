'use client';

import { Info } from 'lucide-react';
import { useFormatter, useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import type { PhishingStats } from '@/types/phishing-detection';

interface KpiCardsProps {
  stats?: PhishingStats;
  hitRate?: number | null;
  isLoading?: boolean;
  onQuarantinedClick?: () => void;
  onPendingReviewClick?: () => void;
  onRecalledClick?: () => void;
  onRecallSuccessClick?: () => void;
}

interface KpiCardData {
  key: string;
  label: string;
  value: number | string | null;
  hint?: string;
  tone?: 'default' | 'red' | 'orange' | 'green';
  onClick?: () => void;
}

function KpiCard({ label, value, hint, tone, onClick, isLoading }: {
  label: string;
  value: number | string | null;
  hint?: string;
  tone?: 'default' | 'red' | 'orange' | 'green';
  onClick?: () => void;
  isLoading?: boolean;
}) {
  const display = value === null || value === undefined ? '—' : value;
  const toneCls = {
    default: 'text-foreground',
    red: 'text-destructive',
    orange: 'text-warning',
    green: 'text-success',
  }[tone ?? 'default'];
  const content = (
    <>
      <p className="flex items-center gap-1 text-sm text-muted-foreground">{label}{hint ? <Tooltip><TooltipTrigger aria-label={hint} render={<Info tabIndex={0} className="size-3.5 cursor-help" />} /><TooltipContent className="max-w-xs">{hint}</TooltipContent></Tooltip> : null}</p>
      <div className={cn('mt-2 text-2xl font-bold tabular-nums', toneCls, value === null && 'text-muted-foreground')}>
        {isLoading ? <span className="inline-block h-7 w-16 animate-pulse rounded-md bg-muted" /> : display}
      </div>
    </>
  );
  if (onClick) {
    return (
      <Button
        variant="outline"
        onClick={onClick}
        className="h-auto w-full cursor-pointer flex-col items-stretch whitespace-normal rounded-xl border-border bg-card p-4 text-left shadow-sm data-[hovered=true]:bg-muted/35"
      >
        {content}
      </Button>
    );
  }
  return (
    <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
      {content}
    </div>
  );
}

export function KpiCards({ stats, hitRate, isLoading, onQuarantinedClick, onPendingReviewClick, onRecalledClick, onRecallSuccessClick }: KpiCardsProps) {
  const t = useTranslations('phishingDetection');
  const ta = useTranslations('agentCenterOverview.metrics');
  const format = useFormatter();

  const cards: KpiCardData[] = [
    {
      key: 'today_detected',
      label: t('kpi.todayDetected'),
      value: stats?.today_detected ?? null,
    },
    {
      key: 'today_quarantined',
      label: t('kpi.todayQuarantined'),
      value: stats?.today_quarantined ?? null,
      tone: 'red',
      onClick: onQuarantinedClick,
    },
    {
      key: 'pending_review',
      label: t('kpi.pendingReview'),
      value: stats?.pending_review ?? null,
      tone: 'orange',
      onClick: onPendingReviewClick,
    },
    {
      key: 'today_recalled',
      label: t('kpi.todayRecalled'),
      value: stats?.today_recalled ?? null,
      tone: 'orange',
      onClick: onRecalledClick,
    },
    {
      key: 'recall_success',
      label: t('kpi.recallSuccess'),
      value: stats?.recall_success ?? null,
      tone: 'green',
      onClick: onRecallSuccessClick,
    },
    {
      key: 'hit_rate',
      label: ta('hitRate'),
      hint: ta('hitRateTooltip.phishing'),
      value: hitRate === null || hitRate === undefined ? null : format.number(hitRate, { style: 'percent', maximumFractionDigits: 1 }),
    },
  ];

  return (
    <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-6">
      {cards.map((card) => (
        <KpiCard
          key={card.key}
          label={card.label}
          value={card.value}
          hint={card.hint}
          tone={card.tone}
          onClick={card.onClick}
          isLoading={isLoading}
        />
      ))}
    </div>
  );
}
