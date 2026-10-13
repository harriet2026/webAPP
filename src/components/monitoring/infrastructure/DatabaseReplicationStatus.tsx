'use client';

import { useLocale, useTranslations } from 'next-intl';
import { formatMetric } from './format_metric';
import { Badge } from '@/components/ui/badge';
import { ChevronDown } from 'lucide-react';
import type { DatabaseReplication } from '@/types/monitoring';

export function DatabaseReplicationStatus({ replication, source }: { replication?: DatabaseReplication; source: 'db' | 'redis' }) {
  const locale = useLocale();
  const t = useTranslations('infrastructure.database');
  const state = replication?.state ?? 'unknown';
  const redisReplica = source === 'redis' && (replication?.role === 'replica' || replication?.scope === 'redis_receive_to_apply');
  const offsetLabel = source !== 'redis' ? 'replication.offset'
    : redisReplica ? 'replication.receiveOffset'
    : replication?.role === 'primary' ? 'replication.primaryOffset' : 'replication.redisOffset';
  return <div className="mt-3 border-t border-border/60 pt-3 text-xs text-muted-foreground" data-testid={`monitor-infrastructure-${source}-replication`} data-state={state} data-node={replication?.node}>
    <details className="group/replication" key={`${source}-${replication?.node ?? ''}`} data-testid={`monitor-infrastructure-${source}-replication-details`}>
      <summary className="flex cursor-pointer list-none flex-wrap items-center justify-between gap-2 rounded-sm focus-visible:outline-2 focus-visible:outline-ring [&::-webkit-details-marker]:hidden" data-testid={`monitor-infrastructure-${source}-replication-trigger`}>
        <span className="flex flex-wrap items-center gap-2">
          <Badge variant={['error', 'down', 'no_receiver'].includes(state) ? 'destructive' : 'secondary'} className={state === 'streaming' ? 'bg-success/10 text-success' : undefined} data-testid={`monitor-infrastructure-${source}-replication-state`}>{t(`replication.states.${state}`)}</Badge>
          {replication?.role && <span>{t(`replication.${replication.role}`)}</span>}
          {replication?.peers != null && <span>{t('replication.peers', { count: replication.peers })}</span>}
        </span>
        <span className="inline-flex items-center gap-1 text-muted-foreground">
          {t('replication.details')}<ChevronDown className="size-3.5 transition-transform group-open/replication:rotate-180" aria-hidden="true" />
        </span>
      </summary>
      <div className="mt-3 space-y-2 rounded-lg bg-muted/50 p-3 leading-relaxed" data-testid={`monitor-infrastructure-${source}-replication-content`}>
        <p>{t(offsetLabel)}: {replication?.lag_bytes != null ? `${formatMetric(replication.lag_bytes, locale, 0)} B` : '—'}</p>
        {source === 'db' && <p>{t('replication.delay')}: {replication?.lag_state === 'ok' && replication.lag_ms != null
          ? `${formatMetric(replication.lag_ms, locale)} ms` : t(`metricStates.${replication?.lag_state === 'unsupported' ? 'unsupported' : 'missing'}`)}</p>}
        <p>{t(source === 'db' ? 'replication.dbScope' : 'replication.redisScope')}</p>
        {(redisReplica || replication?.scope === 'db_receive_to_apply') && <p>{t('replication.receiveScope')}</p>}
      </div>
    </details>
  </div>;
}
