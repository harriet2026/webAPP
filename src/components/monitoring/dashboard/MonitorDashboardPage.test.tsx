import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { AnchorHTMLAttributes } from 'react';
import { MonitorDashboardPage } from './MonitorDashboardPage';

// Mock echarts (canvas 不支持 jsdom)
vi.mock('echarts-for-react', () => ({
  __esModule: true,
  default: ({ option }: {
    option: {
      grid?: { bottom?: number };
      legend?: { bottom?: number; data?: string[] };
      series?: unknown[];
    };
  }) => (
    <div
      data-testid="echarts-mock"
      data-grid-bottom={option.grid?.bottom}
      data-legend-bottom={option.legend?.bottom}
      data-legend-count={option.legend ? (option.legend.data?.length ?? option.series?.length ?? 0) : 0}
    />
  ),
}));

// Mock i18n/navigation（避免 next-intl navigation 拉 next/navigation）
vi.mock('@/i18n/navigation', () => ({
  Link: ({ children, href, ...rest }: AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) =>
    <a href={href} {...rest}>{children}</a>,
}));

const { overviewFor, mockOverview } = vi.hoisted(() => {
  const overviewFor = (range: string) => {
    const volumes: Record<string, number> = { today: 125847, '24h': 252300, '7d': 902331, '30d': 3820100 };
    return {
      range,
      kpi: {
        today_volume: volumes[range] ?? volumes.today,
        volume_change: 8.3,
        delivery_success_rate: 97.2,
        delivery_success_change: 0.4,
        queue_depth: 1240,
        threats: 4,
        nodes_online: 4,
        nodes_total: 4,
        engines_healthy: 4,
        engines_total: 4,
        todo: 2,
        critical_todo: 1,
        major_todo: 1,
      },
      infrastructure: { cpu_usage: 45, memory_usage: 62, disk_usage: 78, database_status: 'ok', status: 'normal' },
      mailflow_health: { queue_depth: 1240, latency_p95: 1.2, status: 'warning' },
      engine_health: ['antispam', 'antivirus', 'sandbox', 'rbl'].map((key) => ({ key, status: 'normal' })),
      alert_health: { unconfirmed: 2, processing: 5, resolved: 12 },
      recent_alerts: [1, 2, 3, 4].map((id) => ({
        id,
        time: `2026-07-23T0${Math.max(5, 10 - id)}:00:00+08:00`,
        module: '邮件流',
        message: `告警 ${id}`,
        status: id === 1 ? 'unconfirmed' : 'processing',
        severity: id < 3 ? 'critical' : 'warning',
      })),
      mailflow_trend: [{ time: '10:00', volume: 100, latency_p95: 1.2 }],
      engine_trend: [{ time: '10:00', antispam: 10, antivirus: 2, sandbox: 1, rbl: 3 }],
      degraded: false,
    };
  };
  return {
    overviewFor,
    mockOverview: { value: undefined as ReturnType<typeof overviewFor> | undefined },
  };
});

// Mock the backend hook with backend-shaped data; the component no longer has
// any component-local demo fallback.
vi.mock('@/lib/api/monitor-dashboard', () => ({
  useMonitorDashboardOverview: (range: string) => ({
    data: mockOverview.value ?? overviewFor(range),
    isError: false,
    isLoading: false,
    isFetching: false,
    refetch: vi.fn().mockResolvedValue({}),
  }),
}));

// Mock next-intl：返回 key 路径本身便于断言（monitorDashboard.* / 嵌套）
vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => {
    const map: Record<string, string> = {
      title: '监控总览', lastUpdate: '最近更新', refreshOff: '关闭',
      mailflowTrend: '邮件流健康趋势（24h）', engineTrend: '检测引擎性能趋势（24h）',
      alertsHealth: '告警健康', alertMarquee: '实时告警', noAlerts: '暂无告警', viewDetails: '查看详情',
      'range.today': '今天', 'range.24h': '24小时', 'range.7d': '7天', 'range.30d': '30天',
      'kpi.todayVolume': '今日邮件量', 'kpi.deliverySuccessRate': '投递成功率', 'kpi.queueDepth': '队列深度',
      'kpi.alerts': '告警', 'kpi.nodes': '节点', 'kpi.todo': '待办',
      'alert.unconfirmed': '未确认', 'alert.processing': '处理中', 'alert.resolved': '已解决',
      'engine.antispam': '反垃圾', 'engine.antivirus': '反病毒', 'engine.sandbox': '沙箱', 'engine.rbl': 'RBL',
      allNormal: '全部正常', 'status.normal': '正常', 'status.warning': '警告', 'status.critical': '严重', 'status.unknown': '未知',
      mailflowVolume: '邮件量', latencyP95: '投递延时 P95',
    };
    return map[key] ?? key;
  },
}));

describe('MonitorDashboardPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockOverview.value = undefined;
  });

  it('渲染页头、KPI 卡片、趋势卡、告警卡与 data-testid', () => {
    render(<MonitorDashboardPage />);
    expect(screen.getByTestId('monitor-dashboard-page')).toBeTruthy();
    expect(screen.getByText('监控总览')).toBeTruthy();
    expect(screen.getByTestId('monitor-dashboard-range-select')).toBeTruthy();
    expect(screen.getByTestId('monitor-dashboard-refresh-select')).toBeTruthy();
    expect(screen.getByTestId('monitor-dashboard-refresh-btn')).toBeTruthy();
    // 6 张 KPI 卡
    for (const k of ['today-volume', 'delivery-rate', 'queue-depth', 'alerts', 'nodes', 'todo']) {
      expect(screen.getByTestId(`monitor-dashboard-kpi-${k}`)).toBeTruthy();
    }
    // today 默认 KPI 值
    expect(screen.getByText('125,847')).toBeTruthy();
    expect(screen.getByText('97.2%')).toBeTruthy();
    expect(within(screen.getByTestId('monitor-dashboard-kpi-alerts')).getByText('4/4')).toBeTruthy();
    // 区块
    expect(screen.getByTestId('monitor-dashboard-mailflow-trend')).toBeTruthy();
    expect(screen.getByTestId('monitor-dashboard-engine-trend')).toBeTruthy();
    expect(screen.getByTestId('monitor-dashboard-alerts-health')).toBeTruthy();
    expect(screen.getByTestId('monitor-dashboard-alert-marquee')).toBeTruthy();
  });

  it('切换时间范围 → 使用对应 range 的后端数据', async () => {
    const user = userEvent.setup();
    render(<MonitorDashboardPage />);
    const kpiCard = screen.getByTestId('monitor-dashboard-kpi-today-volume');
    expect(within(kpiCard).getByText('125,847')).toBeTruthy(); // today
    // Base UI Select：user.click combobox 开弹层，点 option
    await user.click(screen.getByTestId('monitor-dashboard-range-select'));
    const opt = await screen.findByRole('option', { name: '7天' });
    await user.click(opt);
    expect(within(screen.getByTestId('monitor-dashboard-kpi-today-volume')).getByText('902,331')).toBeTruthy(); // 7d
  });

  it('四系列趋势图为横坐标和可能换行的图例预留独立底部空间', () => {
    render(<MonitorDashboardPage />);
    const chart = screen.getAllByTestId('echarts-mock').find((item) => item.dataset.legendCount === '4');
    expect(chart).toBeTruthy();
    expect(chart?.dataset.legendBottom).toBe('0');
    expect(Number(chart?.dataset.gridBottom)).toBeGreaterThanOrEqual(72);
  });

  it('检测引擎和基础设施卡片显示真实且本地化的状态', () => {
    const overview = overviewFor('today');
    mockOverview.value = {
      ...overview,
      kpi: { ...overview.kpi, engines_healthy: 3, nodes_online: 3 },
      infrastructure: { ...overview.infrastructure, database_status: 'critical', status: 'critical' },
      engine_health: overview.engine_health.map((item) => item.key === 'sandbox' ? { ...item, status: 'warning' as const } : item),
    };
    render(<MonitorDashboardPage />);

    expect(within(screen.getByTestId('monitor-dashboard-kpi-alerts')).getByText('警告')).toBeTruthy();
    expect(within(screen.getByTestId('monitor-dashboard-kpi-nodes')).getByText('严重')).toBeTruthy();
    expect(within(screen.getByTestId('monitor-dashboard-infra-database')).getByText('严重')).toBeTruthy();
    expect(screen.queryByText('全部正常')).toBeNull();
  });

  it('基础设施指标使用可访问进度条并将数据库 ok 显示为正常', () => {
    render(<MonitorDashboardPage />);
    expect(screen.getAllByRole('progressbar')).toHaveLength(3);
    expect(screen.getByRole('progressbar', { name: 'metric.cpu' }).getAttribute('aria-valuenow')).toBe('45');
    expect(within(screen.getByTestId('monitor-dashboard-infra-database')).getByText('正常')).toBeTruthy();
    expect(screen.queryByText('ok')).toBeNull();
  });

  it('有告警时启用跑马灯，并只暴露一份可访问链接', () => {
    render(<MonitorDashboardPage />);
    expect(screen.getByTestId('monitor-dashboard-marquee-track').classList.contains('animate-marquee')).toBe(true);
    expect(screen.queryByTestId('monitor-dashboard-marquee-empty')).toBeNull();
    for (const id of [1, 2, 3, 4]) {
      expect(screen.getByTestId(`monitor-dashboard-marquee-item-${id}`)).toBeTruthy();
    }
    const clones = screen.getByTestId('monitor-dashboard-marquee-track').querySelectorAll('[aria-hidden="true"]');
    expect(clones).toHaveLength(4);
    for (const clone of clones) expect((clone as HTMLElement).tabIndex).toBe(-1);
  });

  it('无告警时显示空态，不渲染动画与查看全部链接', () => {
    mockOverview.value = { ...overviewFor('today'), recent_alerts: [] };
    render(<MonitorDashboardPage />);
    expect(screen.getByTestId('monitor-dashboard-marquee-empty').textContent).toBe('暂无告警');
    expect(screen.queryByTestId('monitor-dashboard-marquee-track')).toBeNull();
    expect(screen.queryByTestId('monitor-dashboard-alert-view-all')).toBeNull();
  });

  it('仅在存在未处理告警时让 todo KPI 卡脉冲', () => {
    const { unmount } = render(<MonitorDashboardPage />);
    const activeCard = screen.getByTestId('monitor-dashboard-kpi-todo').querySelector('[data-slot="card"]');
    expect(activeCard?.classList.contains('animate-pulse')).toBe(true);

    unmount();
    const zero = overviewFor('today');
    mockOverview.value = {
      ...zero,
      kpi: { ...zero.kpi, todo: 0, critical_todo: 0, major_todo: 0 },
    };
    render(<MonitorDashboardPage />);
    const quietCard = screen.getByTestId('monitor-dashboard-kpi-todo').querySelector('[data-slot="card"]');
    expect(quietCard?.classList.contains('animate-pulse')).toBe(false);
  });

  it('趋势图外链指向正确页面，模块和趋势卡头保持 flex 单行布局', () => {
    render(<MonitorDashboardPage />);
    expect(screen.getByTestId('monitor-dashboard-mailflow-trend-link').getAttribute('href')).toBe('/monitoring/mailflow');
    expect(screen.getByTestId('monitor-dashboard-engine-trend-link').getAttribute('href')).toBe('/monitoring/security');

    for (const id of [
      'monitor-dashboard-module-infrastructure',
      'monitor-dashboard-module-mailflow',
      'monitor-dashboard-module-engine',
      'monitor-dashboard-module-alerts',
      'monitor-dashboard-mailflow-trend',
      'monitor-dashboard-engine-trend',
    ]) {
      const header = screen.getByTestId(id).querySelector('[data-slot="card-header"]');
      expect(header?.classList.contains('flex')).toBe(true);
    }
  });

  it('告警健康显示 未确认2/处理中5/已解决12', () => {
    render(<MonitorDashboardPage />);
    const health = screen.getByTestId('monitor-dashboard-alerts-health');
    expect(within(health).getByText('未确认')).toBeTruthy();
    expect(within(health).getByText('处理中')).toBeTruthy();
    expect(within(health).getByText('已解决')).toBeTruthy();
    expect(within(health).getByText('2')).toBeTruthy();
    expect(within(health).getByText('5')).toBeTruthy();
    expect(within(health).getByText('12')).toBeTruthy();
  });
});
