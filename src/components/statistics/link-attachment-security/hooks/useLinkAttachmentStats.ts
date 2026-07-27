import { useQuery } from '@tanstack/react-query';
import { getLinkAttachmentStats, type Direction } from '@/lib/api/link-attachment-security';
import { useScopedApiRequest } from '@/lib/api/client';

export function useLinkAttachmentStats(params: {
  startDate: string;
  endDate: string;
  direction: Direction;
  tenantId: number | null;
}) {
  const { apiRequest } = useScopedApiRequest(params.tenantId);

  return useQuery({
    queryKey: ['link-attachment-stats', params.tenantId, params.direction, params.startDate, params.endDate],
    queryFn: () => getLinkAttachmentStats({
      direction: params.direction,
      start_date: params.startDate,
      end_date: params.endDate,
    }, apiRequest),
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });
}
