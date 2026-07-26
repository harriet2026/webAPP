'use client';

import { useTranslations } from 'next-intl';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { TenantSelector } from '@/components/layout/tenant-selector';
import { useProductForm } from '@/contexts/product-form-context';
import { Building2 } from 'lucide-react';
import { DIR_APPLICABLE, DIR_FIXED, type DimensionType } from './columns';
import type { OpsDirection, OpsTimeRange, OpsTopCount } from '@/lib/api/ops-top';

interface FilterBarProps {
  dimension: DimensionType;
  direction: OpsDirection;
  onDirectionChange: (d: OpsDirection) => void;
  timeRange: OpsTimeRange;
  onTimeRangeChange: (r: OpsTimeRange) => void;
  topCount: OpsTopCount;
  onTopCountChange: (c: OpsTopCount) => void;
}

const DIRECTIONS: OpsDirection[] = ['all', 'receive', 'send', 'internal'];
const TIME_RANGES: OpsTimeRange[] = ['today', '7d', '30d', 'thisMonth', 'lastMonth'];
const TOP_COUNTS: OpsTopCount[] = ['10', '50', '100'];

export function FilterBar({
  dimension,
  direction,
  onDirectionChange,
  timeRange,
  onTimeRangeChange,
  topCount,
  onTopCountChange,
}: FilterBarProps) {
  const t = useTranslations('opsTopTrend');
  const { capabilities, viewer } = useProductForm();
  const showTenant = !!capabilities?.multiTenant && viewer === 'platform';
  const dirDisabled = !DIR_APPLICABLE[dimension];
  // When direction buttons are disabled, highlight the actual fixed direction the backend uses.
  const effectiveDirection = dirDisabled ? (DIR_FIXED[dimension] ?? 'all') : direction;

  return (
    <div className="flex items-center justify-between rounded-[10px] bg-card p-4 shadow-sm">
      <div className="flex items-center gap-4">
        {showTenant && (
          <div className="flex h-[53px] shrink-0 items-center gap-2 border-b border-border bg-card px-4 py-2.5">
            <Building2 className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
            <span className="whitespace-nowrap text-sm text-muted-foreground">{t('tenantScope')}</span>
            <TenantSelector className="h-8 w-64" />
          </div>
        )}

      <Tooltip>
        <TooltipTrigger
          render={
            <div
              className={`flex items-center gap-0 overflow-hidden rounded border border-border bg-card ${
                dirDisabled ? 'opacity-50' : ''
              }`}
              aria-disabled={dirDisabled}
            />
          }
        >
          {DIRECTIONS.map((d) => (
            <button
              key={d}
              type="button"
              disabled={dirDisabled}
              onClick={() => onDirectionChange(d)}
              className={`shrink-0 whitespace-nowrap border-r border-border px-4 py-1.5 text-sm transition-colors last:border-r-0 ${
                effectiveDirection === d
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-card text-foreground hover:bg-muted'
              }`}
            >
              {t(`direction.${d}`)}
            </button>
          ))}
        </TooltipTrigger>
        {dirDisabled && <TooltipContent>{t('dirFixedTip')}</TooltipContent>}
      </Tooltip>

      <Select value={timeRange} onValueChange={(v) => onTimeRangeChange(v as OpsTimeRange)}>
        <SelectTrigger size="sm" className="w-32">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {TIME_RANGES.map((r) => (
            <SelectItem key={r} value={r}>
              {t(`timeRange.${r}`)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <div className="flex h-[34px] w-[233px] items-center gap-0 overflow-hidden rounded border border-border bg-card">
        {TOP_COUNTS.map((c) => (
          <button
            key={c}
            type="button"
            onClick={() => onTopCountChange(c)}
            className={`flex-1 whitespace-nowrap border-r border-border px-3 py-1.5 text-sm transition-colors last:border-r-0 ${
              topCount === c
                ? 'bg-primary text-primary-foreground'
                : 'bg-card text-foreground hover:bg-muted'
            }`}
          >
            TOP {c}
          </button>
        ))}
      </div>
      </div>
    </div>
  );
}
