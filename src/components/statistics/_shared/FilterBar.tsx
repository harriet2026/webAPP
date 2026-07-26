'use client';

import { useTranslations } from 'next-intl';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Label } from '@/components/ui/label';

export type Direction = 'all' | 'receive' | 'send' | 'internal';
export type TimeRange = 'today' | '7d' | '30d' | 'this_month' | 'last_month';

const DIRECTIONS: Direction[] = ['all', 'receive', 'send', 'internal'];
const TIME_RANGES: TimeRange[] = ['today', '7d', '30d', 'this_month', 'last_month'];

interface FilterBarProps {
  direction: Direction;
  onDirectionChange: (d: Direction) => void;
  timeRange: TimeRange;
  onTimeRangeChange: (r: TimeRange) => void;
  /** next-intl namespace prefix, e.g. 'deliveryTraffic' / 'linkAttachmentSecurity' */
  namespace: string;
}

/**
 * Shared FilterBar (direction + time range) for the statistics pages that use
 * the Select + segmented-button layout (delivery-traffic, link-attachment-security).
 * security-overview keeps its own FilterBar (uses SegmentedControl + compare toggle).
 */
export function FilterBar({
  direction,
  onDirectionChange,
  timeRange,
  onTimeRangeChange,
  namespace,
}: FilterBarProps) {
  const t = useTranslations(namespace);

  return (
    <div className="flex flex-wrap items-center gap-4">
      <div className="flex items-center gap-2">
        <Label className="text-sm text-muted-foreground whitespace-nowrap">{t('direction.label')}</Label>
        <Select value={direction} onValueChange={(v) => onDirectionChange(v as Direction)}>
          <SelectTrigger size="sm" className="w-28">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {DIRECTIONS.map((d) => (
              <SelectItem key={d} value={d}>{t(`direction.${d}`)}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="flex items-center gap-1 rounded-xl border border-border/70 bg-muted/40 p-1">
        {TIME_RANGES.map((r) => (
          <button
            key={r}
            onClick={() => onTimeRangeChange(r)}
            className={`rounded-lg px-3 py-1 text-sm font-medium transition-colors ${
              timeRange === r
                ? 'bg-background shadow-sm text-foreground'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            {t(`timeRange.${r}`)}
          </button>
        ))}
      </div>
    </div>
  );
}
