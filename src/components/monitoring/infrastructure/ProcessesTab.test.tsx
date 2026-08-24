import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import zh from '../../../../messages/zh.json';

// Trend charts pull echarts; stub it to keep the test lightweight.
vi.mock('echarts-for-react', () => ({
  default: () => null,
}));

vi.mock('./hooks', () => ({
  useProcesses: vi.fn(),
  useRuntime: vi.fn(() => ({ data: undefined, isLoading: false })),
  useDockerContainers: vi.fn(() => ({ data: undefined, isLoading: false })),
  useRuntimeTrend: vi.fn(() => ({ data: undefined, isLoading: false })),
}));

import { ProcessesTab } from './ProcessesTab';
import { useProcesses } from './hooks';

const mockedUseProcesses = vi.mocked(useProcesses);

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
});
