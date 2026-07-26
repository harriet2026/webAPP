import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { MonitorSecurityPage } from './MonitorSecurityPage';

vi.mock('echarts-for-react', () => ({
  __esModule: true,
  default: () => <div data-testid="echarts-mock" />,
}));

vi.mock('@/contexts/auth-context', () => ({
  useAuth: () => ({ isSystemAdmin: true }),
}));

vi.mock('./hooks', () => ({
  useSecurityEngine: (engine: string, range: string) => {
    const rowCount = engine === 'sandbox' ? 3 : range === '24h' ? 4 : range === '7d' ? 7 : 30;
    return {
      data: {
        engine,
        range,
        cards: ['antispam', 'antivirus', 'sandbox', 'rbl'].map((key) => ({
          key,
          status: 'normal',
          primary_value: key === 'rbl' ? 1200 : 120,
        })),
        trend: [{ ts: '00:00', primary: 1, secondary: 2 }],
        details: Array.from({ length: rowCount }, (_, index) => engine === 'sandbox'
          ? { id: `sandbox-${index}`, node_name: `sandbox-0${index}`, node_status: 'normal' }
          : {
              id: `${engine}-${index}`,
              instance_id: `${engine}-01`,
              time_period: String(index),
            }),
        collected_at: '2026-07-23T10:00:00Z',
      },
      isLoading: false,
      isFetching: false,
      isError: false,
      refetch: vi.fn(),
    };
  },
}));

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string, values?: Record<string, string>) => {
    const labels: Record<string, string> = {
      title: '检测引擎状态',
      refresh: '刷新',
      normal: '正常',
      abnormal: '异常',
      noData: '暂无数据',
      'range.24h': '最近24小时',
      'range.7d': '最近7天',
      'range.30d': '最近30天',
      'engine.antispam': '反垃圾引擎',
      'engine.antivirus': '反病毒引擎',
      'engine.sandbox': '沙箱引擎',
      'engine.rbl': 'RBL查询',
    };
    if (key === 'performanceTrend') return `${values?.engine}性能趋势`;
    if (key === 'detailTitle') return `${values?.engine}运行明细`;
    if (key === 'lastUpdated') return `最近更新：${values?.time}`;
    return labels[key] ?? key;
  },
}));

describe('MonitorSecurityPage', () => {
  it('renders API-backed cards and switches the selected engine', () => {
    render(<MonitorSecurityPage />);
    expect(screen.getByTestId('monitor-security-page')).toBeTruthy();
    expect(screen.getByTestId('monitor-security-engine-antispam').getAttribute('aria-pressed')).toBe('true');
    for (const engine of ['antispam', 'antivirus', 'sandbox', 'rbl']) {
      expect(screen.getByTestId(`monitor-security-engine-${engine}`)).toBeTruthy();
    }

    fireEvent.click(screen.getByTestId('monitor-security-engine-sandbox'));
    expect(screen.getByTestId('monitor-security-engine-sandbox').getAttribute('aria-pressed')).toBe('true');
    expect(screen.getAllByTestId(/^monitor-security-detail-row-sandbox-/)).toHaveLength(3);
  });
});
