'use client';

import { useLocale, useTranslations } from 'next-intl';
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
import { useDataUpdate, matchesInfrastructureQuery } from './use_data_update';

interface ControlBarProps {
  tab: string;
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
  tab,
  nodes,
  node,
  range,
  onNodeChange,
  onRangeChange,
  rangeDisabled = false,
}: ControlBarProps) {
  const t = useTranslations('infrastructure');
  const locale = useLocale();
  const queryClient = useQueryClient();
  const [spinning, setSpinning] = useState(false);
  const { updatedAt, failed, fetching } = useDataUpdate(tab, node, range);

  const handleRefresh = useCallback(() => {
    setSpinning(true);
    queryClient.invalidateQueries({ predicate: (q) =>
      (q.queryKey[0] === 'monitoring' && q.queryKey[1] === 'nodes') || matchesInfrastructureQuery(q, tab, node, range),
    }).finally(() => {
      setSpinning(false);
    });
  }, [queryClient, tab, node, range]);

  const RANGES: { value: TimeRange; label: string }[] = [
    { value: '1h', label: t('range.1h') },
    { value: '24h', label: t('range.24h') },
    { value: '7d', label: t('range.7d') },
  ];

  const updatedTime = updatedAt ? new Date(updatedAt).toLocaleString(locale) : '—';

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

      <Button variant="outline" size="sm" onClick={handleRefresh} disabled={spinning || fetching} data-testid="monitor-infrastructure-refresh">
        <RefreshCw className={`mr-1.5 h-3.5 w-3.5 ${spinning || fetching ? 'animate-spin' : ''}`} />
        {t('refresh')}
      </Button>

      <span className="ml-auto text-xs text-muted-foreground" title={t('updateTimeHint')} data-testid="monitor-infrastructure-updated-at">
        {t('fetchedAt')}: {updatedTime}
        {failed && <span role="status" className="ml-2 text-destructive">{t('fetchFailed')}</span>}
      </span>
    </div>
  );
}
