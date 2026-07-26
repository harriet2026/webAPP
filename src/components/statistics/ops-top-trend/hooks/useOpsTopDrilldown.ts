import { useQuery } from '@tanstack/react-query';
import { fetchOpsDrilldown, type OpsDimension, type OpsDirection, type OpsTimeRange } from '@/lib/api/ops-top';
import { useApiRequest } from '@/lib/api/client';
import { useTenant } from '@/hooks/use-tenant';

export function useOpsTopDrilldown(args: {
  dimension: OpsDimension; subDim: string; key: string | null; account?: string;
  direction: OpsDirection; timeRange: OpsTimeRange; enabled: boolean;
}) {
  const { apiRequest } = useApiRequest();
  const { selectedTenantId } = useTenant();
  return useQuery({
    queryKey: ['ops-top-drilldown', selectedTenantId, args.dimension, args.subDim, args.key, args.account, args.direction, args.timeRange],
    queryFn: () => fetchOpsDrilldown({
      dimension: args.dimension, subDim: args.subDim, key: args.key as string,
      account: args.account, direction: args.direction, timeRange: args.timeRange,
    }, apiRequest),
    enabled: args.enabled && !!args.key,
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });
}
