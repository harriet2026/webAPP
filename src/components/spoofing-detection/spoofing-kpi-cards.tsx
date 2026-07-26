'use client';

import { useTranslations } from 'next-intl';
import { Target, ShieldX, Clock, UserX, Globe } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { SpoofingStats } from '@/types/spoofing-detection';

interface Props {
  stats?: SpoofingStats;
  isLoading?: boolean;
  onCategoryClick?: (category: string) => void;
}

function Card({ label, value, icon, onClick, isLoading, tone }: {
  label: string; value: number | null; icon: React.ReactNode;
  onClick?: () => void; isLoading?: boolean; tone?: 'red' | 'orange';
}) {
  const display = value === null || value === undefined ? '—' : value;
  const valueCls = tone === 'red' ? 'text-rose-600' : tone === 'orange' ? 'text-amber-600' : '';
  const body = (
    <>
      <div className="flex items-center justify-between">
        <span className="text-sm text-muted-foreground">{label}</span>
        <span className="text-muted-foreground/80">{icon}</span>
      </div>
      <div className={cn('mt-2 text-2xl font-semibold tabular-nums', valueCls)}>
        {isLoading ? <span className="inline-block h-7 w-16 animate-pulse rounded-md bg-muted" /> : display}
      </div>
    </>
  );
  const base = 'rounded-lg border border-border bg-card p-4';
  if (onClick) {
    return (
      <button type="button" onClick={onClick} className={cn(base, 'text-left transition-colors hover:bg-accent/40')}>
        {body}
      </button>
    );
  }
  return <div className={base}>{body}</div>;
}

export function SpoofingKpiCards({ stats, isLoading, onCategoryClick }: Props) {
  const t = useTranslations('spoofingDetection');
  return (
    <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-5">
      <Card label={t('kpi.todayDetected')} value={stats?.today_detected ?? null} icon={<Target className="h-4 w-4" />}
        isLoading={isLoading} onClick={() => onCategoryClick?.('all')} />
      <Card label={t('kpi.todayIntercepted')} value={stats?.today_intercepted ?? null} icon={<ShieldX className="h-4 w-4" />}
        isLoading={isLoading} tone="red" onClick={() => onCategoryClick?.('intercepted')} />
      <Card label={t('kpi.pendingReview')} value={stats?.pending_review ?? null} icon={<Clock className="h-4 w-4" />}
        isLoading={isLoading} tone="orange" onClick={() => onCategoryClick?.('pending_review')} />
      <Card label={t('kpi.displaynameHits')} value={stats?.displayname_hits ?? null} icon={<UserX className="h-4 w-4" />}
        isLoading={isLoading} onClick={() => onCategoryClick?.('displayname')} />
      <Card label={t('kpi.brandHits')} value={stats?.brand_hits ?? null} icon={<Globe className="h-4 w-4" />}
        isLoading={isLoading} onClick={() => onCategoryClick?.('brand')} />
    </div>
  );
}
