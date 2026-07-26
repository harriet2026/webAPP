import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useApiRequest } from '@/lib/api/client';
import {
  fetchAlerts,
  fetchAlertStats,
  fetchAlert,
  confirmAlert,
  processAlert,
  resolveAlert,
  batchAlerts,
  fetchAlertRules,
  saveAlertRule,
  deleteAlertRule,
  fetchAlertTemplates,
  fetchAlertMetrics,
  getSmtpConfig,
  putSmtpConfig,
  type AlertQuery,
} from '@/lib/api/monitoring';
import type { AlertRulePayload, SmtpConfigPayload } from '@/types/alerts';

const POLL_MS = 30_000;

export function useAlerts(query: AlertQuery, opts: { paused: boolean }) {
  const { apiRequest } = useApiRequest();
  return useQuery({
    queryKey: ['alerts', 'list', query],
    // Pass the React Query signal through so switching tab/filter aborts the
    // in-flight request (review §一.5 / spec §5). Without this, fast filter
    // changes race old responses against the newest one.
    queryFn: ({ signal }) => fetchAlerts(query, apiRequest, signal),
    staleTime: 30_000,
    refetchOnWindowFocus: false,
    refetchInterval: opts.paused ? false : POLL_MS,
  });
}

export function useAlertStats(opts: { paused: boolean }) {
  const { apiRequest } = useApiRequest();
  return useQuery({
    queryKey: ['alerts', 'stats'],
    queryFn: ({ signal }) => fetchAlertStats(apiRequest, signal),
    staleTime: 30_000,
    refetchOnWindowFocus: false,
    refetchInterval: opts.paused ? false : POLL_MS,
  });
}

export function useAlertDetail(id?: number) {
  const { apiRequest } = useApiRequest();
  return useQuery({
    queryKey: ['alerts', 'detail', id],
    queryFn: ({ signal }) => fetchAlert(id as number, apiRequest, signal),
    enabled: id !== undefined,
    staleTime: 30_000,
    refetchOnWindowFocus: false,
  });
}

export function useAlertRules() {
  const { apiRequest } = useApiRequest();
  return useQuery({
    queryKey: ['alerts', 'rules'],
    queryFn: () => fetchAlertRules(apiRequest),
    staleTime: 30_000,
    refetchOnWindowFocus: false,
  });
}

export function useAlertTemplates() {
  const { apiRequest } = useApiRequest();
  return useQuery({
    queryKey: ['alerts', 'templates'],
    queryFn: () => fetchAlertTemplates(apiRequest),
    staleTime: 5 * 60_000,
    refetchOnWindowFocus: false,
  });
}

export function useAlertMetrics() {
  const { apiRequest } = useApiRequest();
  return useQuery({
    queryKey: ['alerts', 'metrics'],
    queryFn: () => fetchAlertMetrics(apiRequest),
    staleTime: 5 * 60_000,
    refetchOnWindowFocus: false,
  });
}

export function useSmtpConfig(enabled: boolean) {
  const { apiRequest } = useApiRequest();
  return useQuery({
    queryKey: ['alerts', 'smtp-config'],
    queryFn: () => getSmtpConfig(apiRequest),
    enabled,
    staleTime: 30_000,
    refetchOnWindowFocus: false,
  });
}

export function useConfirmAlert() {
  const { apiRequest } = useApiRequest();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => confirmAlert(id, apiRequest),
    // Invalidate only the alert list + stats (review §二.10). The previous
    // ['alerts'] root also wiped rules/smtp-config/templates/metrics, causing
    // 6 refetches per mutation.
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['alerts', 'list'] });
      qc.invalidateQueries({ queryKey: ['alerts', 'stats'] });
      qc.invalidateQueries({ queryKey: ['alerts', 'detail'] });
    },
  });
}

export function useProcessAlert() {
  const { apiRequest } = useApiRequest();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => processAlert(id, apiRequest),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['alerts', 'list'] });
      qc.invalidateQueries({ queryKey: ['alerts', 'stats'] });
      qc.invalidateQueries({ queryKey: ['alerts', 'detail'] });
    },
  });
}

export function useResolveAlert() {
  const { apiRequest } = useApiRequest();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => resolveAlert(id, apiRequest),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['alerts', 'list'] });
      qc.invalidateQueries({ queryKey: ['alerts', 'stats'] });
      qc.invalidateQueries({ queryKey: ['alerts', 'detail'] });
    },
  });
}

export function useBatchAlerts() {
  const { apiRequest } = useApiRequest();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { action: 'confirm' | 'resolve'; ids: number[] }) =>
      batchAlerts(v.action, v.ids, apiRequest),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['alerts', 'list'] });
      qc.invalidateQueries({ queryKey: ['alerts', 'stats'] });
      qc.invalidateQueries({ queryKey: ['alerts', 'detail'] });
    },
  });
}

export function useSaveAlertRule() {
  const { apiRequest } = useApiRequest();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { payload: AlertRulePayload; id?: number }) =>
      saveAlertRule(v.payload, v.id, apiRequest),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['alerts', 'rules'] }),
  });
}

export function useDeleteAlertRule() {
  const { apiRequest } = useApiRequest();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => deleteAlertRule(id, apiRequest),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['alerts', 'rules'] }),
  });
}

export function usePutSmtpConfig() {
  const { apiRequest } = useApiRequest();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: SmtpConfigPayload) => putSmtpConfig(payload, apiRequest),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['alerts', 'smtp-config'] }),
  });
}
