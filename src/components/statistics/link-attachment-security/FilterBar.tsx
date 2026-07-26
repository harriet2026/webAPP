'use client';

import { useTranslations } from 'next-intl';
import { Building2 } from 'lucide-react';
import { TenantSelector } from '@/components/layout/tenant-selector';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import type { Direction, TimeRange } from '@/lib/api/link-attachment-security';

interface FilterBarProps {
  direction: Direction;
  onDirectionChange: (d: Direction) => void;
  timeRange: TimeRange;
  onTimeRangeChange: (r: TimeRange) => void;
  showTenant?: boolean;
}

export function FilterBar({ direction, onDirectionChange, timeRange, onTimeRangeChange, showTenant = false }: FilterBarProps) {
  const t = useTranslations('linkAttachmentSecurity');
  const directions: Direction[] = ['all', 'receive', 'send', 'internal'];
  const ranges: TimeRange[] = ['today', '7d', '30d', 'this_month', 'last_month'];

  return (
    <div className="flex min-h-[85px] flex-wrap items-center gap-4 rounded-lg bg-card p-4 shadow-sm" data-testid="link-attachment-filters">
      {showTenant && (
        <div className="flex items-center gap-2 border-b border-gray-200 px-4 py-2.5 dark:border-gray-800">
          <Building2 className="h-4 w-4 text-muted-foreground" />
          <Label className="whitespace-nowrap text-sm text-muted-foreground">{t('tenantScope')}</Label>
          <TenantSelector className="!w-64" />
        </div>
      )}

      <div className="flex overflow-hidden rounded border border-gray-300 dark:border-gray-600" role="group" aria-label={t('direction.label')}>
        {directions.map((item) => (
          <button
            key={item}
            type="button"
            aria-pressed={direction === item}
            onClick={() => onDirectionChange(item)}
            className={`border-r px-4 py-1.5 text-sm transition-colors last:border-r-0 ${
              direction === item
                ? 'bg-blue-500 text-white'
                : 'bg-card text-foreground hover:bg-muted'
            }`}
          >
            {t(`direction.${item}`)}
          </button>
        ))}
      </div>

      <Select value={timeRange} onValueChange={(value) => onTimeRangeChange(value as TimeRange)}>
        <SelectTrigger size="sm" className="w-32" aria-label={t('timeRange.label')}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {ranges.map((range) => (
            <SelectItem key={range} value={range}>{t(`timeRange.${range}`)}</SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
