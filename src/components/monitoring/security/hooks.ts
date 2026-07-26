'use client';

import { useQuery } from '@tanstack/react-query';
import { useApiRequest } from '@/lib/api/client';
import { fetchSecurityEngine } from '@/lib/api/monitoring';
import type { SecurityEngine, SecurityTimeRange } from '@/types/monitoring';

export function useSecurityEngine(engine: SecurityEngine, range: SecurityTimeRange) {
  const { apiRequest } = useApiRequest();
  return useQuery({
    queryKey: ['monitoring', 'security', engine, range],
    queryFn: ({ signal }) => fetchSecurityEngine(engine, range, apiRequest, signal),
    staleTime: 30_000,
    refetchOnWindowFocus: false,
    retry: false,
  });
}
