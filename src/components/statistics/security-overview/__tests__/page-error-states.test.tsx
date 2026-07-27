import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '@/lib/api/client';
import { SecurityOverviewPage } from '../SecurityOverviewPage';

const refetch = vi.fn();
let queryState: Record<string, unknown>;

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}));

vi.mock('../hooks/useSecurityOverview', () => ({
  useSecurityOverview: () => queryState,
}));
vi.mock('../hooks/useSecurityScope', () => ({
  useSecurityScope: () => ({ scopeActive: false }),
}));
vi.mock('@/lib/api/tenants', () => ({ getTenant: vi.fn() }));

vi.mock('../FilterBar', () => ({ FilterBar: () => <div data-testid="filter-bar" /> }));
vi.mock('../KpiCards', () => ({
  KpiCards: ({ data }: { data?: { total_filtered?: number } }) => (
    <div data-testid="kpi-cards">{data?.total_filtered ?? 'empty-kpi'}</div>
  ),
}));
vi.mock('../TrendChartCard', () => ({ TrendChartCard: () => <div data-testid="trend-card" /> }));
vi.mock('../GeoDistributionCard', () => ({ GeoDistributionCard: () => <div data-testid="geo-card" /> }));
vi.mock('../TimeDistributionCard', () => ({ TimeDistributionCard: () => <div data-testid="time-card" /> }));
vi.mock('../DetailTable', () => ({ DetailTable: () => <div data-testid="detail-table" /> }));
vi.mock('../BottomActions', () => ({ BottomActions: () => <div data-testid="bottom-actions" /> }));
vi.mock('../DrillDownCard', () => ({ DrillDownCard: () => <div /> }));
vi.mock('../EscapesAlert', () => ({ EscapesAlert: () => <div data-testid="escapes-alert" /> }));
vi.mock('../TenantScopeSelector', () => ({ TenantScopeSelector: () => <div /> }));

function state(patch: Record<string, unknown>) {
  queryState = {
    data: undefined,
    error: null,
    isError: false,
    isFetching: false,
    isLoading: false,
    refetch,
    ...patch,
  };
}

describe('SecurityOverviewPage request states (GT-12483)', () => {
  beforeEach(() => {
    refetch.mockReset();
  });

  it('renders 403 as an explicit permission state, not empty KPI placeholders', () => {
    state({ isError: true, error: new ApiError(403, 'forbidden') });
    render(<SecurityOverviewPage />);

    expect(screen.getByTestId('security-overview-forbidden-state')).toHaveTextContent('error.forbiddenTitle');
    expect(screen.queryByTestId('kpi-cards')).not.toBeInTheDocument();
  });

  it('renders a general load failure with a working retry action', () => {
    state({ isError: true, error: new ApiError(500, 'database unavailable') });
    render(<SecurityOverviewPage />);

    expect(screen.getByTestId('security-overview-error-state')).toHaveTextContent('error.loadFailedTitle');
    fireEvent.click(screen.getByTestId('security-overview-retry'));
    expect(refetch).toHaveBeenCalledTimes(1);
  });

  it('keeps a successful zero-data response in the normal dashboard state', () => {
    state({ data: { kpi: { total_filtered: 0 }, trend: {}, detail_table: {} } });
    render(<SecurityOverviewPage />);

    expect(screen.getByTestId('kpi-cards')).toHaveTextContent('0');
    expect(screen.getByTestId('trend-card')).toBeInTheDocument();
    expect(screen.getByTestId('geo-card').parentElement).toHaveClass('lg:grid-cols-2');
    expect(screen.getByTestId('time-card').parentElement).toBe(screen.getByTestId('geo-card').parentElement);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});
