'use client';

import { useTranslations } from 'next-intl';
import { RefreshCw } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { useState, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { NodeInfo, TimeRange } from '@/types/monitoring';

interface ControlBarProps {
  nodes: NodeInfo[];
  node: string;
  range: TimeRange;
  onNodeChange: (node: string) => void;
  onRangeChange: (range: TimeRange) => void;
  // GT-11536: when true (nodes loading or unavailable), disable range
  // switching so the user doesn't think a silent no-op is a UI bug.
  rangeDisabled?: boolean;
}

export function ControlBar({
  nodes,
  node,
  range,
  onNodeChange,
  onRangeChange,
  rangeDisabled = false,
}: ControlBarProps) {
  const t = useTranslations('infrastructure');
  const queryClient = useQueryClient();
  const [spinning, setSpinning] = useState(false);
  const [lastFetchAt, setLastFetchAt] = useState<Date>(new Date());

  const handleRefresh = useCallback(() => {
    setSpinning(true);
    queryClient.invalidateQueries({ queryKey: ['monitoring'] }).finally(() => {
      setLastFetchAt(new Date());
      setTimeout(() => setSpinning(false), 600);
    });
  }, [queryClient]);

  const RANGES: { value: TimeRange; label: string }[] = [
    { value: '1h', label: t('range.1h') },
    { value: '24h', label: t('range.24h') },
    { value: '7d', label: t('range.7d') },
  ];

  const updatedAt = lastFetchAt.toLocaleTimeString();

  return (
    <div className="flex flex-wrap items-center gap-3" data-testid="monitor-infrastructure-control-bar">
      <Select value={node} onValueChange={(v) => v !== null && onNodeChange(v)}>
        <SelectTrigger className="w-48" data-testid="monitor-infrastructure-node-select">
          <SelectValue placeholder={t('selectNode')} />
        </SelectTrigger>
        <SelectContent data-testid="monitor-infrastructure-node-options">
          {nodes.map((n) => (
            <SelectItem key={n.id} value={n.id} data-testid={`monitor-infrastructure-node-option-${n.id}`}>
              {n.id}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select value={range} onValueChange={(v) => v !== null && onRangeChange(v as TimeRange)}>
        <SelectTrigger className="w-36" disabled={rangeDisabled} data-testid="monitor-infrastructure-range-select">
          <SelectValue />
        </SelectTrigger>
        <SelectContent data-testid="monitor-infrastructure-range-options">
          {RANGES.map((r) => (
            <SelectItem key={r.value} value={r.value} data-testid={`monitor-infrastructure-range-${r.value}`}>
              {r.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Button variant="outline" size="sm" onClick={handleRefresh} data-testid="monitor-infrastructure-refresh">
        <RefreshCw className={`mr-1.5 h-3.5 w-3.5 ${spinning ? 'animate-spin' : ''}`} />
        {t('refresh')}
      </Button>

      <span className="ml-auto text-xs text-muted-foreground" data-testid="monitor-infrastructure-updated-at">
        {t('updatedAt')}: {updatedAt}
      </span>
    </div>
  );
}
