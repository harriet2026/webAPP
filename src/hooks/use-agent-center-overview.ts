'use client';

import { useQuery } from '@tanstack/react-query';
import { getAgentCenterOverview } from '@/lib/api/agent-center';
import { useApiRequest } from '@/lib/api/client';

export const agentCenterOverviewQueryKey = (tenantId: number | null | undefined) => (
  ['agent-center-overview', tenantId ?? null] as const
);

export function useAgentCenterOverview() {
  const { apiRequest, effectiveTenantId } = useApiRequest();
  return useQuery({
    queryKey: agentCenterOverviewQueryKey(effectiveTenantId),
    queryFn: () => getAgentCenterOverview(apiRequest),
    staleTime: 30_000,
  });
}
