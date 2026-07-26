import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { DimensionTabs } from '@/components/statistics/ops-top-trend/DimensionTabs';

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}));

describe('DimensionTabs connection gating', () => {
  it('hides connection tab for a tenant-scoped viewer', () => {
    render(<DimensionTabs dimension="subject" onSelect={vi.fn()} isPlatformScope={false} />);
    expect(screen.queryByTestId('ops-dim-connection')).toBeNull();
  });

  it('shows connection tab for an unscoped platform admin', () => {
    render(<DimensionTabs dimension="connection" onSelect={vi.fn()} isPlatformScope={true} />);
    expect(screen.getByTestId('ops-dim-connection')).toBeTruthy();
  });
});
