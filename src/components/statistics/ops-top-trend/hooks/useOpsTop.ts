import { useQuery } from '@tanstack/react-query';
import { fetchOpsTop, type OpsTopParams } from '@/lib/api/ops-top';
import { useApiRequest } from '@/lib/api/client';
import { useTenant } from '@/hooks/use-tenant';

export function useOpsTop(params: OpsTopParams) {
  const { apiRequest } = useApiRequest();
  const { selectedTenantId } = useTenant();
  return useQuery({
    queryKey: ['ops-top', selectedTenantId, params.dimension, params.direction, params.timeRange, params.top],
    queryFn: () => fetchOpsTop(params, apiRequest),
    staleTime: 60_000,
    refetchOnWindowFocus: false,
    retry: 1,
  });
}
