'use client';

import { useTranslations } from 'next-intl';
import { format } from 'date-fns';
import { Building2 } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { TenantScopeSelector } from '@/components/statistics/security-overview/TenantScopeSelector';
import type { Direction, TimeRange } from '@/lib/api/delivery-traffic';

interface FilterBarProps {
  direction: Direction;
  onDirectionChange: (d: Direction) => void;
  timeRange: TimeRange;
  onTimeRangeChange: (r: TimeRange) => void;
  showTenant: boolean;
  tenantId: number | null;
  onTenantChange: (tenantId: number | null) => void;
  customStart: string;
  customEnd: string;
  onCustomStartChange: (value: string) => void;
  onCustomEndChange: (value: string) => void;
  dateError?: string;
}

const DIRECTIONS: Direction[] = ['all', 'receive', 'send', 'internal'];
const TIME_RANGES: TimeRange[] = ['today', '7d', '30d', 'this_month', 'last_month', 'custom'];

export function FilterBar({
  direction,
  onDirectionChange,
  timeRange,
  onTimeRangeChange,
  showTenant,
  tenantId,
  onTenantChange,
  customStart,
  customEnd,
  onCustomStartChange,
  onCustomEndChange,
  dateError,
}: FilterBarProps) {
  const t = useTranslations('deliveryTraffic');
  const today = format(new Date(), 'yyyy-MM-dd');

  return (
    <div className="flex min-h-[85px] items-center justify-between rounded-lg bg-card p-4 shadow-sm [&_[role=combobox]]:bg-card" data-testid="delivery-traffic-filter-bar">
      <div className="flex flex-wrap items-center gap-4">
        {showTenant && (
          <div className="mx-4 flex items-center gap-2 [&_button[role=combobox]]:w-64">
            <Building2 className="h-4 w-4 text-muted-foreground" />
            <TenantScopeSelector value={tenantId} onChange={onTenantChange} />
          </div>
        )}

        <div className="flex items-center">
          <Label className="sr-only">{t('direction.label')}</Label>
          <div className="flex overflow-hidden rounded border border-border" role="group" aria-label={t('direction.label')}>
            {DIRECTIONS.map((item) => (
              <button
                key={item}
                type="button"
                data-testid={`delivery-direction-${item}`}
                aria-pressed={direction === item}
                onClick={() => onDirectionChange(item)}
                className={`border-r border-border px-4 py-1.5 text-sm transition-colors last:border-r-0 ${
                  direction === item
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-card text-foreground hover:bg-muted'
                }`}
              >
                {t(`direction.${item}`)}
              </button>
            ))}
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Label className="sr-only">{t('timeRange.label')}</Label>
          <Select value={timeRange} onValueChange={(value) => onTimeRangeChange(value as TimeRange)}>
            <SelectTrigger className="w-32" data-testid="delivery-time-range">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {TIME_RANGES.map((item) => <SelectItem key={item} value={item}>{t(`timeRange.${item}`)}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>

        {timeRange === 'custom' && (
          <div className="flex flex-wrap items-center gap-2" data-testid="delivery-custom-range">
            <Input
              type="date"
              aria-label={t('timeRange.startDate')}
              value={customStart}
              max={customEnd || today}
              onChange={(event) => onCustomStartChange(event.target.value)}
              className="w-40"
            />
            <span className="text-sm text-muted-foreground">—</span>
            <Input
              type="date"
              aria-label={t('timeRange.endDate')}
              value={customEnd}
              min={customStart}
              max={today}
              onChange={(event) => onCustomEndChange(event.target.value)}
              className="w-40"
            />
          </div>
        )}
      </div>
      {dateError && <p className="mt-2 text-sm text-destructive" role="alert">{dateError}</p>}
    </div>
  );
}
