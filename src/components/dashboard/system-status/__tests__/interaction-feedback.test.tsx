import type { AnchorHTMLAttributes } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import type { SystemStatusData } from '../hooks';
import { KpiCards } from '../kpi-cards';

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}));

vi.mock('@/i18n/navigation', () => ({
  Link: ({
    children,
    href,
    ...props
  }: AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

const DATA: SystemStatusData = {
  inbound: 120,
  inboundDelta: 8,
  threats: 4,
  threatsDelta: 0,
  blockRate: 3.33,
  pending: 2,
  pendingIsolated: 1,
  pendingReport: 1,
  nodesOnline: 2,
  nodesTotal: 2,
  threatTrend: [],
  top5: [],
  alerts: [],
  agents: null,
  isLoading: false,
  isError: false,
};

describe('system-status interaction feedback', () => {
  it('uses the shared pointer surface for KPI drill-down cards', () => {
    render(<KpiCards data={DATA} showInfra />);
    const cardLink = screen.getByTestId('system-status-kpi-card-inbound');
    const cardSurface = cardLink.querySelector('[data-slot="card"]');

    expect(cardLink).not.toHaveAttribute('data-hovered');
    expect(cardLink).toHaveClass(
      'duration-[240ms]',
      'motion-reduce:transition-none',
      'focus-visible:ring-2',
    );
    expect(cardSurface).toHaveClass(
      'group-data-[hovered=true]/interactive:bg-muted/[0.15]',
      'group-data-[hovered=true]/interactive:shadow-md',
    );

    fireEvent.pointerEnter(cardLink, { pointerType: 'touch' });
    expect(cardLink).not.toHaveAttribute('data-hovered');

    fireEvent.pointerEnter(cardLink, { pointerType: 'mouse' });
    expect(cardLink).toHaveAttribute('data-hovered', 'true');

    fireEvent.pointerLeave(cardLink);
    expect(cardLink).not.toHaveAttribute('data-hovered');
  });
});
