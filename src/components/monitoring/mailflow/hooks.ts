'use client';

import { useQuery } from '@tanstack/react-query';
import { useApiRequest } from '@/lib/api/client';
import {
  fetchMailflowQueue,
  fetchMailflowQueueTrend,
  fetchMailflowDelivery,
  fetchMailflowBounce,
  fetchMailflowConnection,
  fetchMailflowConnectionTrend,
  fetchMailflowConnectionFailure,
} from '@/lib/api/monitoring';
import type { TimeRange, MailflowDirection } from '@/types/monitoring';

// Per spec §3.6: mailflow API calls must time out at 10s. On timeout the UI
// keeps the last successful data and surfaces a "load timeout" banner instead
// of clearing the view. We expose TIMED_OUT so consumers can distinguish a
// timeout from a generic fetch failure (React Query folds both into isError).
export const MAILFLOW_TIMEOUT_MS = 10_000;
export const TIMED_OUT = 'mailflow_timeout';

// All mailflow queries below set `retry: false`. React Query's default
// `retry: 3` would silently re-issue a timed-out request ~3 more times (each
// waiting the full 10s timeout), so the TimeoutBanner would only surface after
// ~40s instead of at 10s, and the extra retry fetches perturb request-count
// assertions. On a monitoring dashboard the timeout should be shown promptly;
// the manual Refresh button and tab re-entry are the retry path.

// withTimeout composes the React Query abort signal (cancelled on unmount /
// query invalidation) with a hard 10s timeout. The resulting signal aborts as
// soon as EITHER fires. On the timeout leg we reject with TIMED_OUT so callers
// can tell the two apart; on the user-cancel leg we rethrow the AbortError so
// React Query marks the query as cancelled (not errored).
//
// AbortSignal.timeout() and AbortSignal.any() are available in evergreen
// browsers and Node 18+; the Playwright E2E runner targets evergreen browsers.
function withTimeout(signal: AbortSignal | undefined): AbortSignal {
  const signals: AbortSignal[] = [AbortSignal.timeout(MAILFLOW_TIMEOUT_MS)];
  if (signal) signals.push(signal);
  return AbortSignal.any(signals);
}

// isTimeoutError reports whether a React Query error came from the 10s timeout.
// We also re-throw AbortError when the timeout fires to keep React Query's
// cancelled-vs-error distinction, so this check inspects the DOMException name.
export function isTimeoutError(err: unknown): boolean {
  if (err instanceof DOMException && err.name === 'TimeoutError') return true;
  if (err instanceof Error && err.message === TIMED_OUT) return true;
  return false;
}

export function useMailflowQueue(node: string, range: TimeRange, direction: MailflowDirection) {
  const { apiRequest } = useApiRequest();
  return useQuery({
    queryKey: ['monitoring', 'mailflow', 'queue', node, range, direction],
    queryFn: ({ signal }) => fetchMailflowQueue(node, range, direction, apiRequest, withTimeout(signal)),
    staleTime: 30_000,
    enabled: !!node,
    refetchOnWindowFocus: false,
    retry: false,
  });
}

export function useMailflowQueueTrend(node: string, range: TimeRange) {
  const { apiRequest } = useApiRequest();
  return useQuery({
    queryKey: ['monitoring', 'mailflow', 'queueTrend', node, range],
    queryFn: ({ signal }) => fetchMailflowQueueTrend(node, range, apiRequest, withTimeout(signal)),
    staleTime: 30_000,
    enabled: !!node,
    refetchOnWindowFocus: false,
    retry: false,
  });
}

export function useMailflowDelivery(range: TimeRange, direction: MailflowDirection) {
  const { apiRequest } = useApiRequest();
  return useQuery({
    queryKey: ['monitoring', 'mailflow', 'delivery', range, direction],
    queryFn: ({ signal }) => fetchMailflowDelivery(range, direction, apiRequest, withTimeout(signal)),
    staleTime: 30_000,
    refetchOnWindowFocus: false,
    retry: false,
  });
}

export function useMailflowBounce(range: TimeRange, direction: MailflowDirection) {
  const { apiRequest } = useApiRequest();
  return useQuery({
    queryKey: ['monitoring', 'mailflow', 'bounce', range, direction],
    queryFn: ({ signal }) => fetchMailflowBounce(range, direction, apiRequest, withTimeout(signal)),
    staleTime: 30_000,
    refetchOnWindowFocus: false,
    retry: false,
  });
}

export function useMailflowConnection(node: string, range: TimeRange, direction: MailflowDirection) {
  const { apiRequest } = useApiRequest();
  return useQuery({
    queryKey: ['monitoring', 'mailflow', 'connection', node, range, direction],
    queryFn: ({ signal }) => fetchMailflowConnection(node, range, direction, apiRequest, withTimeout(signal)),
    staleTime: 30_000,
    enabled: !!node,
    refetchOnWindowFocus: false,
    retry: false,
  });
}

export function useMailflowConnectionTrend(node: string, range: TimeRange, direction: MailflowDirection) {
  const { apiRequest } = useApiRequest();
  return useQuery({
    queryKey: ['monitoring', 'mailflow', 'connectionTrend', node, range, direction],
    queryFn: ({ signal }) => fetchMailflowConnectionTrend(node, range, direction, apiRequest, withTimeout(signal)),
    staleTime: 30_000,
    enabled: !!node,
    refetchOnWindowFocus: false,
    retry: false,
  });
}

export function useMailflowConnectionFailure(range: TimeRange, direction: MailflowDirection) {
  const { apiRequest } = useApiRequest();
  return useQuery({
    queryKey: ['monitoring', 'mailflow', 'connectionFailure', range, direction],
    queryFn: ({ signal }) => fetchMailflowConnectionFailure(range, direction, apiRequest, withTimeout(signal)),
    staleTime: 30_000,
    refetchOnWindowFocus: false,
    retry: false,
  });
}
