import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { ReactNode } from 'react';
import { InfrastructurePage } from './InfrastructurePage';

// GT-11699 / GT-11534: /monitor/nodes now degrades (HTTP 200 + `degraded`)
// instead of erroring when the TSDB is unavailable. The page must ALWAYS render
// the ControlBar + Tabs and surface a code-mapped DegradedBanner inline.

// useNodes is driven per-test; the tab-data hooks return quiescent empty state
// so the default (hardware) tab renders its EmptyState without touching echarts.
const { useNodesMock } = vi.hoisted(() => ({ useNodesMock: vi.fn() }));

const idleTab = { data: undefined, isLoading: false, isError: false };
vi.mock('./hooks', () => ({
  useNodes: () => useNodesMock(),
  useHardware: () => ({ ...idleTab }),
  useProcesses: () => ({ ...idleTab }),
  useRuntime: () => ({ ...idleTab }),
  useDockerContainers: () => ({ ...idleTab }),
  useRuntimeTrend: () => ({ ...idleTab }),
  useDatabase: () => ({ ...idleTab }),
  useStorage: () => ({ ...idleTab }),
  useBackup: () => ({ ...idleTab }),
  useBackupDetail: () => ({ ...idleTab }),
}));

vi.mock('@/contexts/auth-context', () => ({
  useAuth: () => ({ isSystemAdmin: true }),
}));

// Identity translator: banners key off the translated label text, so this
// returns the namespace-qualified raw key rather than resolving real copy.
vi.mock('next-intl', () => ({
  useTranslations: (namespace: string) => (key: string) => `${namespace}.${key}`,
  useLocale: () => 'zh',
}));

function renderWithQuery(ui: ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}

describe('InfrastructurePage - node-list degrade', () => {
  beforeEach(() => {
    useNodesMock.mockReset();
  });

  it('renders ControlBar + Tabs + a code-mapped degraded banner when nodes is degraded', () => {
    useNodesMock.mockReturnValue({
      data: { items: [], degraded: true, degraded_code: 'metrics_backend_unavailable' },
      isError: false,
      isLoading: false,
    });

    renderWithQuery(<InfrastructurePage />);

    // ControlBar node selector (placeholder) + the four tab triggers still render.
    expect(screen.getByText('infrastructure.selectNode')).toBeInTheDocument();
    expect(screen.getByText('infrastructure.tabs.hardware')).toBeInTheDocument();
    expect(screen.getByText('infrastructure.tabs.database')).toBeInTheDocument();

    // The backend-unavailable code maps to the degradeBackendUnavailable message.
    expect(
      screen.getByText('infrastructure.degradeBackendUnavailable'),
    ).toBeInTheDocument();
  });

  it('renders no degraded banner when nodes is not degraded', () => {
    useNodesMock.mockReturnValue({
      data: { items: [] },
      isError: false,
      isLoading: false,
    });

    renderWithQuery(<InfrastructurePage />);

    // Full page still renders...
    expect(screen.getByText('infrastructure.selectNode')).toBeInTheDocument();
    expect(screen.getByText('infrastructure.tabs.hardware')).toBeInTheDocument();

    // ...but no degrade banner of any code.
    expect(
      screen.queryByText('infrastructure.degradeBackendUnavailable'),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText('infrastructure.degradeNotInitialized'),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText('infrastructure.degradeDbUnavailable'),
    ).not.toBeInTheDocument();
  });
});
