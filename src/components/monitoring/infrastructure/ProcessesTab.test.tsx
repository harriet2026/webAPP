import { beforeEach, describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NextIntlClientProvider } from 'next-intl';
import zh from '../../../../messages/zh.json';
import type { DockerContainersResp, ServiceTrendResp } from '@/types/monitoring';

interface CapturedChartOption {
  xAxis: { axisLabel: { formatter: (value: string) => string } };
}

const mocks = vi.hoisted(() => ({
  chartOptions: [] as CapturedChartOption[],
  runtimeTrendData: undefined as ServiceTrendResp | undefined,
  dockerContainersData: undefined as DockerContainersResp | undefined,
  dockerContainersError: false,
}));

// Trend charts pull echarts; stub it to keep the test lightweight.
vi.mock('echarts-for-react', () => ({
  default: ({ option }: { option: CapturedChartOption }) => {
    mocks.chartOptions.push(option);
    return null;
  },
}));

vi.mock('./hooks', () => ({
  useProcesses: vi.fn(),
  useRuntime: vi.fn(() => ({ data: undefined, isLoading: false })),
  useDockerContainers: vi.fn(() => ({
    data: mocks.dockerContainersData,
    isLoading: false,
    isError: mocks.dockerContainersError,
  })),
  useRuntimeTrend: vi.fn(() => ({ data: mocks.runtimeTrendData, isLoading: false })),
}));

import { ProcessesTab } from './ProcessesTab';
import { useProcesses } from './hooks';

const mockedUseProcesses = vi.mocked(useProcesses);

beforeEach(() => {
  mocks.chartOptions = [];
  mocks.runtimeTrendData = undefined;
  mocks.dockerContainersData = undefined;
  mocks.dockerContainersError = false;
});

function renderTab(processes: unknown) {
  mockedUseProcesses.mockReturnValue({ data: processes, isLoading: false, isError: false } as never);
  return render(
    <NextIntlClientProvider locale="zh" messages={zh}>
      <ProcessesTab node="dev" range="1h" />
    </NextIntlClientProvider>,
  );
}

function processesResp(overlay2: number, procs: object[]) {
  return {
    docker: { running: 8, stopped: 1, restarts: 0 },
    overlay2_usage: overlay2,
    processes: procs,
  };
}

describe('ProcessesTab', () => {
  it('colors the overlay2 ring green at 72% (below thresholds)', () => {
    renderTab(processesResp(72, []));
    expect(screen.getByTestId('monitor-infrastructure-overlay-arc').getAttribute('class')).toContain('text-green-500');
  });

  it('colors the overlay2 ring yellow above 85%', () => {
    renderTab(processesResp(90, []));
    expect(screen.getByTestId('monitor-infrastructure-overlay-arc').getAttribute('class')).toContain('text-yellow-500');
  });

  it('colors the overlay2 ring red above 95%', () => {
    renderTab(processesResp(96, []));
    expect(screen.getByTestId('monitor-infrastructure-overlay-arc').getAttribute('class')).toContain('text-red-500');
  });

  it('renders the overlay2 explanation and thresholds as styled rows', () => {
    renderTab(processesResp(72, []));
    expect(screen.getByText('Docker存储驱动空间占用')).toBeTruthy();
    expect(screen.getByText('>85% 告警').getAttribute('class')).toContain('mt-2 text-yellow-600');
    expect(screen.getByText('>95% 严重').getAttribute('class')).toContain('text-red-600');
  });

  it('renders localized running/stopped badges instead of raw status strings', () => {
    renderTab(
      processesResp(50, [
        { name: 'apiserver', status: 'running', pid: 100, memory: 1024 },
        { name: 'missing', status: 'stopped', pid: 0, memory: 0 },
      ]),
    );
    const runningRow = screen.getByTestId('monitor-infrastructure-process-row-apiserver');
    expect(runningRow.textContent).toContain('运行中');
    expect(runningRow.textContent).not.toContain('running');
    const stoppedRow = screen.getByTestId('monitor-infrastructure-process-row-missing');
    expect(stoppedRow.textContent).toContain('已停止');
  });

  it('shows process count in the detail column for multi-process services, PID otherwise', () => {
    renderTab(
      processesResp(50, [
        { name: 'postfix', status: 'running', pid: 100, memory: 1024, count: 50 },
        { name: 'redis-server', status: 'running', pid: 200, memory: 1024, count: 1 },
      ]),
    );
    expect(screen.getByTestId('monitor-infrastructure-process-row-postfix').textContent).toContain('进程数：50');
    expect(screen.getByTestId('monitor-infrastructure-process-row-redis-server').textContent).toContain('PID: 200');
  });

  it('shows complete stopped-container details with localized Docker states', async () => {
    const user = userEvent.setup();
    mocks.dockerContainersData = {
      containers: [
        { name: 'web', state: 'running', image: 'registry.example/team/web:long-release-tag' },
        { name: 'init', state: 'exited', image: 'registry.example/team/init:1' },
        { name: 'worker', state: 'created', image: 'registry.example/team/worker:1' },
      ],
    };
    renderTab({
      ...processesResp(50, []),
      docker: { running: 1, stopped: 2, restarts: 0 },
    });

    await user.click(screen.getByTestId('monitor-infrastructure-container-stopped'));

    const drawer = await screen.findByTestId('monitor-infrastructure-container-drawer');
    expect(drawer.textContent).toContain('已停止 (2)');
    expect(drawer.textContent).toContain('registry.example/team/init:1');
    expect(drawer.textContent).toContain('registry.example/team/worker:1');
    expect(drawer.textContent).toContain('已退出');
    expect(drawer.textContent).toContain('已创建');
    expect(drawer.textContent).not.toContain('registry.example/team/web:long-release-tag');
    expect(drawer.textContent).not.toContain('exited');
    expect(drawer.textContent).not.toContain('created');
  });

  it('formats both runtime trend axes for the selected time range', () => {
    const timestamp = '2026-08-24T07:30:00.000Z';
    mocks.runtimeTrendData = {
      goroutine: { apiserver: { points: [{ ts: timestamp, value: 42 }] } },
      heap: { apiserver: { points: [{ ts: timestamp, value: 128 }] } },
    };

    const { rerender } = renderTab(processesResp(50, []));
    expect(mocks.chartOptions).toHaveLength(2);
    for (const option of mocks.chartOptions) {
      expect(option.xAxis.axisLabel.formatter(timestamp)).toBe(new Intl.DateTimeFormat('zh', {
        hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
      }).format(new Date(timestamp)));
      expect(option.xAxis.axisLabel.formatter('invalid timestamp')).toBe('invalid timestamp');
    }

    mocks.chartOptions = [];
    rerender(
      <NextIntlClientProvider locale="zh" messages={zh}>
        <ProcessesTab node="dev" range="7d" />
      </NextIntlClientProvider>,
    );
    expect(mocks.chartOptions).toHaveLength(2);
    for (const option of mocks.chartOptions) {
      expect(option.xAxis.axisLabel.formatter(timestamp)).toBe(new Intl.DateTimeFormat('zh', {
        month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
      }).format(new Date(timestamp)));
    }
  });
});
