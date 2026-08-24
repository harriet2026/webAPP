import type { ButtonHTMLAttributes, HTMLAttributes, ReactNode } from 'react';
import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  useProductForm: vi.fn(),
}));

vi.mock('next-intl', () => ({
  useTranslations: (namespace: string) => (key: string) => `${namespace}.${key}`,
}));

vi.mock('@tanstack/react-query', () => ({
  useQueryClient: () => ({ invalidateQueries: vi.fn().mockResolvedValue(undefined) }),
}));

vi.mock('@/contexts/product-form-context', () => ({
  useProductForm: mocks.useProductForm,
}));

vi.mock('@/components/shared/page-header-controls', () => ({
  PageHeaderActionButton: ({ children, ...props }: ButtonHTMLAttributes<HTMLButtonElement>) => (
    <button {...props}>{children}</button>
  ),
  PageHeaderSelectTrigger: ({ children, ...props }: HTMLAttributes<HTMLButtonElement>) => (
    <button {...props}>{children}</button>
  ),
}));

vi.mock('@/components/shared/page-shell', () => ({
  PageShell: ({ children, ...props }: HTMLAttributes<HTMLDivElement>) => <main {...props}>{children}</main>,
  PageHeader: ({ title, actions }: { title: ReactNode; actions: ReactNode }) => (
    <header>
      <h1>{title}</h1>
      {actions}
    </header>
  ),
}));

vi.mock('@/components/ui/select', () => ({
  Select: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  SelectContent: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  SelectItem: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  SelectValue: () => <span>range</span>,
}));

vi.mock('../hooks', () => ({
  useSystemStatusData: () => ({
    alerts: [{ level: 'danger' }],
    threats: 1,
    threatTrend: [],
    top5: [],
    agents: null,
    agentsLoading: false,
    nodesOnline: 0,
    nodesTotal: 0,
    nodesDegraded: false,
    isLoading: false,
    isError: false,
  }),
}));

vi.mock('../visibility', () => ({
  useSystemStatusVisibility: () => ({ showAgents: false, showInfra: false, overviewCols: 1 }),
  overviewGridClass: () => 'xl:grid-cols-1',
}));

vi.mock('../health-banner', () => ({
  HealthBanner: () => <div data-testid="health-banner-mock" />,
}));

vi.mock('../kpi-cards', () => ({
  KpiCards: () => <div data-testid="kpi-cards-mock" />,
}));

vi.mock('../threat-trend', () => ({
  ThreatTrend: () => <div data-testid="threat-trend-mock" />,
}));

vi.mock('../agent-overview', () => ({ AgentOverview: () => <div /> }));
vi.mock('../threat-top5', () => ({ ThreatTop5: () => <div /> }));
vi.mock('../system-health-card', () => ({ SystemHealthCard: () => <div /> }));

import { SystemStatusDashboard } from '../system-status-dashboard';

describe('GT-12930 system-status health banner switch', () => {
  beforeEach(() => {
    mocks.useProductForm.mockReset();
  });

  it('OSGATEWAY_PRODUCT_FORM_SWITCHER 关闭时不渲染整条健康横幅', () => {
    mocks.useProductForm.mockReturnValue({ switcherEnabled: false });

    render(<SystemStatusDashboard />);

    expect(screen.queryByTestId('health-banner-mock')).not.toBeInTheDocument();
    expect(screen.getByTestId('kpi-cards-mock')).toBeInTheDocument();
  });

  it('OSGATEWAY_PRODUCT_FORM_SWITCHER 开启时保留健康横幅', () => {
    mocks.useProductForm.mockReturnValue({ switcherEnabled: true });

    render(<SystemStatusDashboard />);

    expect(screen.getByTestId('health-banner-mock')).toBeInTheDocument();
  });
});
