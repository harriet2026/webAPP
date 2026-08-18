import { useQuery } from '@tanstack/react-query';
import { useApiRequest } from '@/lib/api/client';
import {
  fetchNodes,
  fetchHardware,
  fetchProcesses,
  fetchDockerContainers,
  fetchDatabase,
  fetchStorage,
  fetchBackup,
  fetchBackupDetail,
  fetchRuntime,
  fetchRuntimeTrend,
} from '@/lib/api/monitoring';
import type { TimeRange } from '@/types/monitoring';

export function useNodes() {
  const { apiRequest } = useApiRequest();
  return useQuery({
    queryKey: ['monitoring', 'nodes'],
    queryFn: () => fetchNodes(apiRequest),
    staleTime: 30_000,
    refetchOnWindowFocus: false,
  });
}

export function useHardware(node: string, range: TimeRange) {
  const { apiRequest } = useApiRequest();
  return useQuery({
    queryKey: ['monitoring', 'hardware', node, range],
    queryFn: () => fetchHardware(node, range, apiRequest),
    staleTime: 15_000,
    refetchInterval: 30_000,
    enabled: !!node,
    refetchOnWindowFocus: false,
  });
}

export function useProcesses(node: string) {
  const { apiRequest } = useApiRequest();
  return useQuery({
    queryKey: ['monitoring', 'processes', node],
    queryFn: () => fetchProcesses(node, apiRequest),
    staleTime: 30_000,
    enabled: !!node,
    refetchOnWindowFocus: false,
  });
}

export function useDatabase(node: string, range: TimeRange) {
  const { apiRequest } = useApiRequest();
  return useQuery({
    queryKey: ['monitoring', 'database', node, range],
    queryFn: () => fetchDatabase(node, range, 'db', 'connections', apiRequest),
    staleTime: 30_000,
    enabled: !!node,
    refetchOnWindowFocus: false,
  });
}

export function useStorage(node: string) {
  const { apiRequest } = useApiRequest();
  return useQuery({
    queryKey: ['monitoring', 'storage', node],
    queryFn: () => fetchStorage(node, apiRequest),
    staleTime: 30_000,
    enabled: !!node,
    refetchOnWindowFocus: false,
  });
}

export function useBackup(node: string) {
  const { apiRequest } = useApiRequest();
  return useQuery({
    queryKey: ['monitoring', 'backup', node],
    queryFn: () => fetchBackup(node, apiRequest),
    staleTime: 30_000,
    enabled: !!node,
    refetchOnWindowFocus: false,
  });
}

export function useBackupDetail(node: string, id: string, enabled: boolean) {
  const { apiRequest } = useApiRequest();
  return useQuery({
    queryKey: ['monitoring', 'backup', node, id],
    queryFn: () => fetchBackupDetail(node, id, apiRequest),
    enabled: enabled && !!node && !!id,
    staleTime: 30_000,
    refetchOnWindowFocus: false,
  });
}

export function useDockerContainers(node: string) {
  const { apiRequest } = useApiRequest();
  return useQuery({
    queryKey: ['monitoring', 'docker-containers', node],
    queryFn: () => fetchDockerContainers(node, apiRequest),
    staleTime: 30_000,
    enabled: !!node,
    refetchOnWindowFocus: false,
  });
}

export function useRuntime(node: string, range: TimeRange) {
  const { apiRequest } = useApiRequest();
  return useQuery({
    queryKey: ['monitoring', 'runtime', node, range],
    queryFn: () => fetchRuntime(node, range, apiRequest),
    staleTime: 30_000,
    enabled: !!node,
    refetchOnWindowFocus: false,
  });
}

export function useRuntimeTrend(node: string, range: TimeRange) {
  const { apiRequest } = useApiRequest();
  return useQuery({
    queryKey: ['monitoring', 'runtime-trend', node, range],
    queryFn: () => fetchRuntimeTrend(node, range, apiRequest),
    staleTime: 30_000,
    enabled: !!node,
    refetchOnWindowFocus: false,
  });
}
