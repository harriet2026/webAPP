'use client';

import { useTranslations } from 'next-intl';
import { Skeleton } from '@/components/ui/skeleton';
import { useDatabase } from './hooks';
import type { TimeRange, DatabaseSummary } from '@/types/monitoring';

export function DatabasePerformanceSummary({ node, range, source }: { node: string; range: TimeRange; source: 'db' | 'redis' }) {
  const t = useTranslations('infrastructure.database');
  const { data, isLoading, isError } = useDatabase(node, range, source, 'summary');
  const summary = data?.summary;
  function value(key: keyof DatabaseSummary['states'], number: number | undefined, latency = false) {
    const state = isError ? 'error' : summary?.states[key] ?? 'missing';
    const validScope = latency
      ? summary?.latency_scope === (source === 'redis' ? 'redis_ping_native' : 'app_db_calls')
      : summary?.connection_scope === (source === 'redis' ? 'selected_node' : 'monitor_database');
    return state === 'ok' && validScope && number != null && Number.isFinite(number)
      ? `${latency ? number.toFixed(2) : number}${latency ? ' ms' : ''}`
      : t(`metricStates.${state === 'ok' ? 'missing' : state}`);
  }
  return <div className="mt-4 border-t pt-4" data-testid="monitor-infrastructure-performance-summary" data-source={source}>
    {isLoading ? <Skeleton className="h-16 w-full" /> : <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      <div className="rounded-md bg-muted/50 p-3" data-testid="monitor-infrastructure-summary-connections">
        <p className="text-xs text-muted-foreground">{t('summary.connections')}</p>
        <p className="mt-1 font-semibold tabular-nums">{value('connections_used', summary?.connections_used)} / {value('connections_max', summary?.connections_max)}</p>
      </div>
      {(source === 'db' ? ['p50', 'p95', 'p99'] as const : ['p99'] as const).map(key => <div key={key} className="rounded-md bg-muted/50 p-3" data-testid={`monitor-infrastructure-summary-${key}`}>
        <p className="text-xs text-muted-foreground">{key.toUpperCase()}</p>
        <p className="mt-1 font-semibold tabular-nums">{value(key, summary?.[`${key}_ms`], true)}</p>
      </div>)}
    </div>}
    <p className="mt-2 text-xs text-muted-foreground">{t(source === 'db' ? 'summary.dbScope' : 'summary.redisScope')}</p>
  </div>;
}
