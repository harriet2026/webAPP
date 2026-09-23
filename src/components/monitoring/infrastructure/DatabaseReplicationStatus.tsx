'use client';

import { useTranslations } from 'next-intl';
import { Badge } from '@/components/ui/badge';
import type { DatabaseReplication } from '@/types/monitoring';

export function DatabaseReplicationStatus({ replication, source }: { replication?: DatabaseReplication; source: 'db' | 'redis' }) {
  const t = useTranslations('infrastructure.database');
  const state = replication?.state ?? 'unknown';
  const redisReplica = source === 'redis' && (replication?.role === 'replica' || replication?.scope === 'redis_receive_to_apply');
  const offsetLabel = source !== 'redis' ? 'replication.offset'
    : redisReplica ? 'replication.receiveOffset'
    : replication?.role === 'primary' ? 'replication.primaryOffset' : 'replication.redisOffset';
  return <div className="mt-3 space-y-1 border-t pt-3 text-xs text-muted-foreground" data-testid={`monitor-infrastructure-${source}-replication`} data-state={state} data-node={replication?.node}>
    <div className="flex flex-wrap items-center gap-2">
      <span>{t('replication.title')}</span>
      <Badge variant={['error', 'down', 'no_receiver'].includes(state) ? 'destructive' : state === 'streaming' ? 'default' : 'secondary'}>{t(`replication.states.${state}`)}</Badge>
      {replication?.role && <span>{t(`replication.${replication.role}`)}</span>}
      {replication?.peers != null && <span>{t('replication.peers', { count: replication.peers })}</span>}
    </div>
    <p>{t(source === 'db' ? 'replication.dbScope' : 'replication.redisScope')}</p>
    {(redisReplica || replication?.scope === 'db_receive_to_apply') && <p>{t('replication.receiveScope')}</p>}
    <p>{t(offsetLabel)}: {replication?.lag_bytes != null ? `${replication.lag_bytes} B` : '—'}</p>
    {source === 'db' && <p>{t('replication.delay')}: {replication?.lag_state === 'ok' && replication.lag_ms != null
      ? `${replication.lag_ms} ms` : t(`metricStates.${replication?.lag_state === 'unsupported' ? 'unsupported' : 'missing'}`)}</p>}
  </div>;
}
