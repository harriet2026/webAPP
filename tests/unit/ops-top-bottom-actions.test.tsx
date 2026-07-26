import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { BottomActions } from '@/components/statistics/ops-top-trend/BottomActions';

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}));

vi.mock('@/lib/api/client', () => ({
  useApiRequest: () => ({ apiRequest: vi.fn() }),
}));

const params = {
  dimension: 'connection' as const,
  direction: 'all' as const,
  timeRange: '7d' as const,
  top: '10' as const,
};

describe('ops top bottom actions', () => {
  it('only renders the CSV export entry', () => {
    render(<BottomActions params={params} />);
    expect(screen.getByText('exportCsv')).toBeTruthy();
    expect(screen.queryByText('generateReport')).toBeNull();
    expect(screen.queryByText('aiAnalysis')).toBeNull();
  });
});
