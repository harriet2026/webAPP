import { useQuery } from '@tanstack/react-query';
import { getTopMaliciousAttachments, type Direction } from '@/lib/api/link-attachment-security';
import { useApiRequest } from '@/lib/api/client';
import { useTenant } from '@/hooks/use-tenant';

export function useTopAttachments(params: {
  startDate: string;
  endDate: string;
  direction: Direction;
  limit: number;
}) {
  const { apiRequest } = useApiRequest();
  const { selectedTenantId } = useTenant();

  return useQuery({
    queryKey: ['link-attachment-top-attachments', selectedTenantId, params.direction, params.startDate, params.endDate, params.limit],
    queryFn: () => getTopMaliciousAttachments({
      direction: params.direction,
      start_date: params.startDate,
      end_date: params.endDate,
      limit: params.limit,
    }, apiRequest),
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });
}
