import { useQuery } from '@tanstack/react-query';
import { getTopMaliciousDomains, type Direction } from '@/lib/api/link-attachment-security';
import { useScopedApiRequest } from '@/lib/api/client';

export function useTopDomains(params: {
  startDate: string;
  endDate: string;
  direction: Direction;
  limit: number;
  tenantId: number | null;
}) {
  const { apiRequest } = useScopedApiRequest(params.tenantId);

  return useQuery({
    queryKey: ['link-attachment-top-domains', params.tenantId, params.direction, params.startDate, params.endDate, params.limit],
    queryFn: () => getTopMaliciousDomains({
      direction: params.direction,
      start_date: params.startDate,
      end_date: params.endDate,
      limit: params.limit,
    }, apiRequest),
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });
}
