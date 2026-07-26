import { useQuery } from '@tanstack/react-query';
import { getLinkAttachmentStats, type Direction } from '@/lib/api/link-attachment-security';
import { useApiRequest } from '@/lib/api/client';
import { useTenant } from '@/hooks/use-tenant';

export function useLinkAttachmentStats(params: {
  startDate: string;
  endDate: string;
  direction: Direction;
}) {
  const { apiRequest } = useApiRequest();
  const { selectedTenantId } = useTenant();

  return useQuery({
    queryKey: ['link-attachment-stats', selectedTenantId, params.direction, params.startDate, params.endDate],
    queryFn: () => getLinkAttachmentStats({
      direction: params.direction,
      start_date: params.startDate,
      end_date: params.endDate,
    }, apiRequest),
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });
}
