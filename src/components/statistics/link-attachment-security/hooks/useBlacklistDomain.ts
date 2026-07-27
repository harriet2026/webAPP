import { useMutation, useQueryClient } from '@tanstack/react-query';
import { blacklistDomain, type Direction } from '@/lib/api/link-attachment-security';
import { useScopedApiRequest } from '@/lib/api/client';

export function useBlacklistDomain(tenantId: number | null) {
  const { apiRequest } = useScopedApiRequest(tenantId);
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ domain, direction }: { domain: string; direction: Direction }) =>
      blacklistDomain(domain, direction, apiRequest),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['link-attachment-top-domains'] });
    },
  });
}
