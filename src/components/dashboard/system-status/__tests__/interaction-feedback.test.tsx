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
  nodesDegraded: false,
  threatTrend: [],
  top5: [],
  alerts: [],
  agents: null,
  agentsLoading: false,
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

// GT-12549: 节点数据源降级时 KPI 必须如实展示"数据源不可用"，
// 绝不渲染看似有效的 0/0。
describe('nodes KPI degrade rendering (GT-12549)', () => {
  it('renders -- and nodesUnavailable when the node source is degraded', () => {
    render(
      <KpiCards
        data={{ ...DATA, nodesOnline: 0, nodesTotal: 0, nodesDegraded: true }}
        showInfra
      />,
    );
    const nodesCard = screen.getByTestId('system-status-kpi-card-nodes');
    expect(nodesCard.textContent).toContain('--');
    expect(nodesCard.textContent).toContain('nodesUnavailable');
    expect(nodesCard.textContent).not.toContain('0/0');
  });

  it('renders real counts when the source is healthy', () => {
    render(<KpiCards data={DATA} showInfra />);
    const nodesCard = screen.getByTestId('system-status-kpi-card-nodes');
    expect(nodesCard.textContent).toContain('2/2');
    expect(nodesCard.textContent).not.toContain('nodesUnavailable');
  });
});
