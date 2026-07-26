import { useQuery } from '@tanstack/react-query';
import { fetchDeliveryTraffic, type Direction } from '@/lib/api/delivery-traffic';
import { useApiRequest } from '@/lib/api/client';
import { useTenant } from '@/hooks/use-tenant';

export function useDeliveryTraffic(params: {
  startDate: string;
  endDate: string;
  direction: Direction;
  tenantId?: number | null;
  enabled?: boolean;
}) {
  const { apiRequest } = useApiRequest();
  const { effectiveTenantId } = useTenant();
  const tenantId = params.tenantId === undefined ? effectiveTenantId : params.tenantId;

  return useQuery({
    queryKey: ['delivery-traffic', tenantId, params.direction, params.startDate, params.endDate],
    queryFn: () => fetchDeliveryTraffic({ ...params, tenantId }, apiRequest),
    enabled: params.enabled !== false,
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });
}
