import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  useDeliveryTraffic: vi.fn(),
  refetch: vi.fn(),
}));

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}));
vi.mock('@/components/shared/page-shell', () => ({
  PageHeader: () => null,
  PageShell: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));
vi.mock('@/components/statistics/security-overview/hooks/useSecurityScope', () => ({
  useSecurityScope: () => ({
    resolvedScopeTenant: null,
    scopeActive: false,
    scopeResolved: true,
  }),
}));
vi.mock('./hooks/useDeliveryTraffic', () => ({
  useDeliveryTraffic: mocks.useDeliveryTraffic,
}));
vi.mock('./FilterBar', () => ({
  FilterBar: ({ onTimeRangeChange }: { onTimeRangeChange: (range: string) => void }) => (
    <button type="button" onClick={() => onTimeRangeChange('today')}>today</button>
  ),
}));
vi.mock('./KpiCards', () => ({ KpiCards: () => null }));
vi.mock('./TrendChart', () => ({ TrendChart: () => null }));
vi.mock('./SideChart', () => ({ SideChart: () => null }));
vi.mock('./LatencyChart', () => ({ LatencyChart: () => null }));
vi.mock('./QueueTrendChart', () => ({ QueueTrendChart: () => null }));
vi.mock('./DetailTable', () => ({ DetailTable: () => null }));
vi.mock('./BottomActions', () => ({ BottomActions: () => null }));

import { DeliveryTrafficPage } from './DeliveryTrafficPage';

describe('DeliveryTrafficPage today granularity', () => {
  beforeEach(() => {
    mocks.useDeliveryTraffic.mockReset();
    mocks.refetch.mockReset();
    mocks.useDeliveryTraffic.mockReturnValue({
      data: undefined,
      isLoading: false,
      isFetching: false,
      isError: false,
      refetch: mocks.refetch,
    });
  });

  it('requests the today range with hourly granularity (GT-12594)', async () => {
    render(<DeliveryTrafficPage />);

    fireEvent.click(screen.getByRole('button', { name: 'today' }));

    await waitFor(() => {
      expect(mocks.useDeliveryTraffic).toHaveBeenLastCalledWith(
        expect.objectContaining({ interval: 'hour' }),
      );
    });
  });
});
