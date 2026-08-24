import type { ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const api = vi.hoisted(() => ({
  summary: vi.fn(),
  opsTop: vi.fn(),
  phishingStats: vi.fn(),
  spoofingStats: vi.fn(),
  threatRetroStats: vi.fn(),
}));

let agentFeatureAccess = {
  phishing: { visible: false, canRequest: false },
  spoofing: { visible: false, canRequest: false },
  'threat-retro': { visible: false, canRequest: false },
};

const scopedRequest = vi.fn();

vi.mock('@/components/statistics/security-overview/hooks/useSecurityScope', () => ({
  useSecurityScope: () => ({
    scopedRequest,
    effectiveViewer: 'tenant',
    resolvedScopeTenant: 42,
    scopeResolved: true,
  }),
}));

vi.mock('../visibility', () => ({
  useAgentFeatureAccess: () => agentFeatureAccess,
}));

vi.mock('@/lib/api/system-status-summary', () => ({ fetchSystemStatusSummary: api.summary }));
vi.mock('@/lib/api/ops-top', () => ({ fetchOpsTop: api.opsTop }));
vi.mock('@/lib/api/phishing-detection', () => ({ getDetectionStats: api.phishingStats }));
vi.mock('@/lib/api/spoofing-detection', () => ({ getSpoofingStats: api.spoofingStats }));
vi.mock('@/lib/api/threat-retro', () => ({ getThreatRetroStats: api.threatRetroStats }));

import { useSystemStatusData } from '../hooks';

function wrapper(queryClient: QueryClient) {
  return function TestQueryProvider({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
  };
}

describe('system-status bootstrap query deduplication (GT-13021)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    agentFeatureAccess = {
      phishing: { visible: false, canRequest: false },
      spoofing: { visible: false, canRequest: false },
      'threat-retro': { visible: false, canRequest: false },
    };
    api.summary.mockResolvedValue({
      current: { mail_volume: 12, threats: 3, block_rate: 25 },
      previous: { mail_volume: 10, threats: 2, block_rate: 20 },
      threat_trend: [],
      pending_disposal: 0,
      pending_report: 0,
      generated_at: '2026-08-18T00:00:00Z',
    });
    api.opsTop.mockResolvedValue({ dimension: 'sender', total: 0, trendLabels: [], rows: [] });
    api.phishingStats.mockResolvedValue({ today_detected: 7, pending_review: 1 });
  });

  it('does not refetch core statistics when bootstrap enables an agent source', async () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false, gcTime: Infinity } },
    });
    const rendered = renderHook(() => useSystemStatusData('24h'), {
      wrapper: wrapper(queryClient),
    });

    await waitFor(() => {
      expect(api.summary).toHaveBeenCalledTimes(1);
      expect(api.opsTop).toHaveBeenCalledTimes(1);
    });

    act(() => {
      agentFeatureAccess = {
        ...agentFeatureAccess,
        phishing: { visible: true, canRequest: true },
      };
      rendered.rerender();
    });

    await waitFor(() => expect(api.phishingStats).toHaveBeenCalledTimes(1));

    expect(api.summary).toHaveBeenCalledTimes(1);
    expect(api.opsTop).toHaveBeenCalledTimes(1);
  });

  it('shows core data without waiting for the newly enabled agent request', async () => {
    let resolveAgentStats!: (value: { today_detected: number; pending_review: number }) => void;
    api.phishingStats.mockImplementation(() => new Promise((resolve) => {
      resolveAgentStats = resolve;
    }));
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false, gcTime: Infinity } },
    });
    const rendered = renderHook(() => useSystemStatusData('24h'), {
      wrapper: wrapper(queryClient),
    });

    await waitFor(() => {
      expect(rendered.result.current.isLoading).toBe(false);
      expect(rendered.result.current.inbound).toBe(12);
    });

    act(() => {
      agentFeatureAccess = {
        ...agentFeatureAccess,
        phishing: { visible: true, canRequest: true },
      };
      rendered.rerender();
    });

    await waitFor(() => expect(rendered.result.current.agentsLoading).toBe(true));
    expect(rendered.result.current.isLoading).toBe(false);
    expect(rendered.result.current.inbound).toBe(12);

    act(() => resolveAgentStats({ today_detected: 7, pending_review: 1 }));
    await waitFor(() => expect(rendered.result.current.agentsLoading).toBe(false));
    expect(rendered.result.current.agents?.phishing?.todayDetected).toBe(7);
  });

  it('surfaces an agent failure without discarding successful core data', async () => {
    api.phishingStats.mockRejectedValue(new Error('agent stats unavailable'));
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false, gcTime: Infinity } },
    });
    const rendered = renderHook(() => useSystemStatusData('24h'), {
      wrapper: wrapper(queryClient),
    });

    await waitFor(() => expect(rendered.result.current.inbound).toBe(12));
    act(() => {
      agentFeatureAccess = {
        ...agentFeatureAccess,
        phishing: { visible: true, canRequest: true },
      };
      rendered.rerender();
    });

    await waitFor(
      () => expect(rendered.result.current.isError).toBe(true),
      { timeout: 3_000 },
    );
    expect(rendered.result.current.inbound).toBe(12);
    expect(api.summary).toHaveBeenCalledTimes(1);
  });
});
