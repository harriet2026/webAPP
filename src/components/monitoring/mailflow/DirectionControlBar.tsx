'use client';

import { useTranslations } from 'next-intl';
import { RefreshCw } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { useState, useCallback, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import type { NodeInfo, TimeRange, MailflowDirection } from '@/types/monitoring';

// Auto-refresh interval (spec §3.6: mailflow auto-refreshes on a fixed
// cadence; manual refresh resets the timer so a click doesn't race the next
// automatic tick). 30s mirrors the React Query staleTime used by the hooks.
const AUTO_REFRESH_INTERVAL_MS = 30_000;

interface DirectionControlBarProps {
  nodes: NodeInfo[];
  node: string;
  range: TimeRange;
  direction: MailflowDirection;
  directionDisabled: boolean;
  onNodeChange: (node: string) => void;
  onRangeChange: (range: TimeRange) => void;
  onDirectionChange: (direction: MailflowDirection) => void;
}

export function DirectionControlBar({
  nodes,
  node,
  range,
  direction,
  directionDisabled,
  onNodeChange,
  onRangeChange,
  onDirectionChange,
}: DirectionControlBarProps) {
  const t = useTranslations('mailflow');
  const queryClient = useQueryClient();
  const [spinning, setSpinning] = useState(false);
  // lastFetchAt is STATE (not a ref) so the "updated at" timestamp re-renders
  // after each refresh; reading a ref during render is a react-hooks lint
  // error and would show a stale time until an unrelated re-render.
  const [lastFetchAt, setLastFetchAt] = useState<Date>(new Date());
  // refreshTick bumps on every manual refresh; the auto-refresh effect below
  // depends on it so the interval timer is re-armed (reset) on each click.
  const [refreshTick, setRefreshTick] = useState(0);

  const invalidate = useCallback(() => {
    return queryClient.invalidateQueries({ queryKey: ['monitoring', 'mailflow'] });
  }, [queryClient]);

  const handleRefresh = useCallback(() => {
    setSpinning(true);
    // Manual refresh must reset the auto-refresh timer so the next automatic
    // tick fires a full interval after this click rather than at the original
    // schedule (spec §3.6 "手动刷新优先并重置自动刷新计时器").
    invalidate().finally(() => {
      setLastFetchAt(new Date());
      setRefreshTick((n) => n + 1);
      setTimeout(() => setSpinning(false), 600);
    });
  }, [invalidate]);

  // Auto-refresh timer. re-armed whenever refreshTick changes (i.e. on manual
  // refresh) and on mount.
  useEffect(() => {
    const id = setInterval(() => {
      invalidate().then(() => {
        setLastFetchAt(new Date());
      });
    }, AUTO_REFRESH_INTERVAL_MS);
    return () => clearInterval(id);
  }, [invalidate, refreshTick]);

  const RANGES: { value: TimeRange; label: string }[] = [
    { value: '1h', label: t('range.1h') },
    { value: '24h', label: t('range.24h') },
    { value: '7d', label: t('range.7d') },
  ];

  const DIRECTIONS: { value: MailflowDirection; label: string }[] = [
    { value: 'all', label: t('direction.all') },
    { value: 'receive', label: t('direction.receive') },
    { value: 'send', label: t('direction.send') },
    { value: 'internal', label: t('direction.internal') },
  ];

  const updatedAt = lastFetchAt.toLocaleTimeString();

  const directionSelect = (
    <Select
      value={direction}
      disabled={directionDisabled}
      onValueChange={(v) =>
        v !== null && onDirectionChange(v as MailflowDirection)
      }
    >
      <SelectTrigger className="w-36" data-testid="monitor-mailflow-direction-select">
        {/* base-ui SelectValue renders the raw value unless given explicit
            children; pass the localized label so the trigger shows 接收/外发…
            instead of receive/send. */}
        <SelectValue>{DIRECTIONS.find((d) => d.value === direction)?.label ?? direction}</SelectValue>
      </SelectTrigger>
      <SelectContent data-testid="monitor-mailflow-direction-options">
        {DIRECTIONS.map((d) => (
          <SelectItem key={d.value} value={d.value} data-testid={`monitor-mailflow-direction-${d.value}`}>
            {d.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );

  return (
    <div className="flex flex-wrap items-center gap-3" data-testid="monitor-mailflow-control-bar">
      <Select value={node} onValueChange={(v) => v !== null && onNodeChange(v)}>
        <SelectTrigger className="w-48" data-testid="monitor-mailflow-node-select">
          <SelectValue placeholder={t('selectNode')} />
        </SelectTrigger>
        <SelectContent data-testid="monitor-mailflow-node-options">
          {nodes.map((n) => (
            <SelectItem key={n.id} value={n.id} data-testid={`monitor-mailflow-node-${n.id}`}>
              {n.id}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select
        value={range}
        onValueChange={(v) => v !== null && onRangeChange(v as TimeRange)}
      >
        <SelectTrigger className="w-36" data-testid="monitor-mailflow-range-select">
          <SelectValue>{RANGES.find((r) => r.value === range)?.label ?? range}</SelectValue>
        </SelectTrigger>
        <SelectContent data-testid="monitor-mailflow-range-options">
          {RANGES.map((r) => (
            <SelectItem key={r.value} value={r.value} data-testid={`monitor-mailflow-range-${r.value}`}>
              {r.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {directionDisabled ? (
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger render={<span className="inline-flex">{directionSelect}</span>} />
            <TooltipContent>{t('queueDirectionDisabled')}</TooltipContent>
          </Tooltip>
        </TooltipProvider>
      ) : (
        directionSelect
      )}

      <Button variant="outline" size="sm" onClick={handleRefresh} data-testid="monitor-mailflow-refresh">
        <RefreshCw className={`mr-1.5 h-3.5 w-3.5 ${spinning ? 'animate-spin' : ''}`} />
        {t('refresh')}
      </Button>

      <span className="ml-auto text-xs text-muted-foreground" data-testid="monitor-mailflow-updated-at">
        {t('updatedAt')}: {updatedAt}
      </span>
    </div>
  );
}
