'use client';

import { useEffect, useState } from 'react';
import { useQueryClient, type Query } from '@tanstack/react-query';

const resources: Record<string, string[]> = {
  hardware: ['hardware'],
  processes: ['processes', 'runtime', 'runtime-trend', 'docker-containers'],
  database: ['database'],
  storage: ['storage', 'backup'],
};

export function matchesInfrastructureQuery(query: Query, tab: string, node: string, range: string) {
  const [namespace, resource, queryNode, queryRange] = query.queryKey;
  if (namespace !== 'monitoring' || queryNode !== node || !resources[tab]?.includes(String(resource))) return false;
  if (['hardware', 'runtime', 'runtime-trend', 'database'].includes(String(resource)) && queryRange !== range) return false;
  // Backup detail drawers do not define the page's update time.
  return resource !== 'backup' || query.queryKey.length === 3;
}

export function useDataUpdate(tab: string, node: string, range: string) {
  const client = useQueryClient();
  const scope = JSON.stringify([tab, node, range]);
  const [display, setDisplay] = useState({ scope: '', signature: '', updatedAt: 0, failed: false, fetching: false });

  useEffect(() => {
    const cache = client.getQueryCache();
    const update = () => {
      const queries = cache.findAll({ predicate: (q) => q.isActive() && matchesInfrastructureQuery(q, tab, node, range) });
      const signature = queries.map((q) => q.queryHash).sort().join('|');
      const failed = queries.some((q) => q.state.status === 'error');
      const fetching = queries.some((q) => q.state.fetchStatus !== 'idle');
      const complete = queries.length > 0 && queries.every((q) => q.state.dataUpdatedAt > 0);
      const oldest = complete ? Math.min(...queries.map((q) => q.state.dataUpdatedAt)) : 0;
      setDisplay((previous) => {
        const same = previous.scope === scope && previous.signature === signature;
        const updatedAt = !failed && !fetching ? oldest : same ? previous.updatedAt : oldest;
        if (same && previous.updatedAt === updatedAt && previous.failed === failed && previous.fetching === fetching) return previous;
        return { scope, signature, updatedAt, failed, fetching };
      });
    };
    const unsubscribe = cache.subscribe(update);
    update();
    return unsubscribe;
  }, [client, tab, node, range, scope]);

  return display.scope === scope ? display : { updatedAt: 0, failed: false, fetching: false };
}
