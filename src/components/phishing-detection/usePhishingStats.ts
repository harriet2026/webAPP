'use client';

import { useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useApiRequest } from '@/lib/api/client';
import { getDetectionStats } from '@/lib/api/phishing-detection';
import { phishingQueryKeys } from './phishing-query-keys';

export function usePhishingStats(enabled = true, refreshBusinessDay = true) {
  const { apiRequest, effectiveTenantId } = useApiRequest();
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: phishingQueryKeys.stats(effectiveTenantId),
    queryFn: () => getDetectionStats({}, apiRequest),
    enabled,
  });
  const nextBusinessDayAt = query.data?.next_business_day_at;
  useEffect(() => {
    if (!enabled || !refreshBusinessDay || !nextBusinessDayAt) return;
    const boundary = Date.parse(nextBusinessDayAt);
    const delay = Number.isFinite(boundary) ? Math.max(1000, boundary - Date.now() + 1000) : 60_000;
    let timer: number;
    const refresh = () => {
      queryClient.invalidateQueries({ queryKey: phishingQueryKeys.statsRoot(effectiveTenantId) });
      // Only mounted log queries that still express "today" follow the day
      // boundary. Sidebar-only pages must never fetch detection logs.
      queryClient.invalidateQueries({
        queryKey: phishingQueryKeys.logsRoot(effectiveTenantId),
        type: 'active',
        predicate: (logQuery) => logQuery.meta?.refreshOnPhishingBusinessDay === true,
      });
      // Failed responses retain the old boundary; keep retrying until the
      // server supplies the next business day.
      timer = window.setTimeout(refresh, 60_000);
    };
    timer = window.setTimeout(refresh, delay);
    return () => window.clearTimeout(timer);
  }, [effectiveTenantId, enabled, nextBusinessDayAt, queryClient, refreshBusinessDay]);
  return query;
}
