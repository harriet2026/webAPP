'use client';

import { useTranslations } from 'next-intl';
import { cn } from '@/lib/utils';
import type { PhishingStats } from '@/types/phishing-detection';

interface KpiCardsProps {
  stats?: PhishingStats;
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
  tone?: 'default' | 'red' | 'orange' | 'green';
  onClick?: () => void;
}

function KpiCard({ label, value, tone, onClick, isLoading }: {
  label: string;
  value: number | string | null;
  tone?: 'default' | 'red' | 'orange' | 'green';
  onClick?: () => void;
  isLoading?: boolean;
}) {
  const display = value === null || value === undefined ? '—' : value;
  const toneCls = {
    default: 'text-foreground',
    red: 'text-red-600',
    orange: 'text-orange-500',
    green: 'text-green-600',
  }[tone ?? 'default'];
  const content = (
    <>
      <p className="text-sm text-[#8C8C8C]">{label}</p>
      <div className={cn('mt-2 text-2xl font-bold tabular-nums', toneCls, value === null && 'text-muted-foreground')}>
        {isLoading ? <span className="inline-block h-7 w-16 animate-pulse rounded-md bg-muted" /> : display}
      </div>
    </>
  );
  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        className="w-full rounded-lg border border-border bg-card p-4 text-left transition-all duration-150 hover:-translate-y-0.5 hover:shadow-md"
      >
        {content}
      </button>
    );
  }
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      {content}
    </div>
  );
}

export function KpiCards({ stats, isLoading, onQuarantinedClick, onPendingReviewClick, onRecalledClick, onRecallSuccessClick }: KpiCardsProps) {
  const t = useTranslations('phishingDetection');

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
      key: 'accuracy',
      label: t('kpi.accuracy'),
      value: stats?.accuracy != null ? `${(stats.accuracy * 100).toFixed(1)}%` : null,
      tone: 'green',
    },
  ];

  return (
    <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-6">
      {cards.map((card) => (
        <KpiCard
          key={card.key}
          label={card.label}
          value={card.value}
          tone={card.tone}
          onClick={card.onClick}
          isLoading={isLoading}
        />
      ))}
    </div>
  );
}
