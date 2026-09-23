import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { DatabaseTab } from '@/components/monitoring/infrastructure/DatabaseTab';

const { request } = vi.hoisted(() => ({ request: vi.fn() }));
vi.mock('@/lib/api/client', () => ({ useApiRequest: () => ({ apiRequest: request }), apiRequest: request }));
vi.mock('next-intl', () => ({
  useLocale: () => 'zh',
  useTranslations: () => (key: string) => key,
}));
vi.mock('echarts-for-react', () => ({ default: ({ option }: { option: { series: { data: number[] }[] } }) => (
  <div data-testid="chart-values">{JSON.stringify(option.series[0].data)}</div>
) }));

describe('database performance switching', () => {
  it.each([true, false])('does not display a control-node role for node2 (scoped response: %s)', async (scoped) => {
    request.mockImplementation(async (url: string) => {
      const node = new URL(url,'http://localhost').searchParams.get('node');
      return {
        supported:true, conn_trend:{points:[]},latency_trend:{points:[]},slow_queries:[],lock_waits:[],
        status:{ db:{ status:'ok', replication:scoped
          ? {node,scope:'selected_node',role:node==='node2'?'replica':'primary',state:'streaming',lag_state:'unsupported'}
          : {scope:'monitor_database',role:'primary',state:'streaming',lag_state:'unsupported'} },redis:{status:'missing'} },
      };
    });
    const client=new QueryClient({defaultOptions:{queries:{retry:false}}});
    const view=render(<QueryClientProvider client={client}><DatabaseTab node="node1" range="1h" /></QueryClientProvider>);
    await screen.findByTestId('monitor-infrastructure-db-replication');
    view.rerender(<QueryClientProvider client={client}><DatabaseTab node="node2" range="1h" /></QueryClientProvider>);
    const card=await screen.findByTestId('monitor-infrastructure-db-replication');
    await waitFor(()=>expect(card).toHaveAttribute('data-state',scoped?'streaming':'unknown'));
    expect(card).not.toHaveTextContent('replication.primary');
    if(scoped) { expect(card).toHaveTextContent('replication.replica');expect(card).toHaveAttribute('data-node','node2'); }
    view.unmount();client.clear();
  });

  it('shows lock request truncation, identities and unknown versus zero statement age', async () => {
    request.mockResolvedValue({
      supported: true, status: { db: { status: 'ok' }, redis: { status: 'missing' } },
      conn_trend: { points: [] }, latency_trend: { points: [] }, slow_queries: [],
      lock_wait_info: { scope: 'monitor_connection_visible_requests', time_basis: 'statement_start', total: 42, limit: 20, truncated: true },
      lock_waits: [
        { wait_type: 'transactionid', wait_object: 'transactionid=456', pid: '9223372036854775807', session_id: '88', mode: 'ShareLock', database_name: 'mail', database_id: '17', user_name: 'alice', query: 'UPDATE items SET value=1', query_started_at: '2026-09-18T10:00:00Z', statement_elapsed_ms: 8123 },
        { wait_type: 'advisory', wait_object: 'objid=12', pid: '89', statement_elapsed_ms: 0 },
        { wait_type: 'relation', wait_object: 'database_oid=18, relation_oid=25', pid: '90' },
      ],
    });
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const view = render(<QueryClientProvider client={client}><DatabaseTab node="dev" range="1h" /></QueryClientProvider>);
    expect(await screen.findByTestId('monitor-infrastructure-lock-wait-count')).toHaveAttribute('data-truncated','true');
    expect(screen.getByTestId('monitor-infrastructure-lock-wait-count')).toHaveTextContent('database.lockWaitTruncated');
    expect(screen.getByTestId('monitor-infrastructure-lock-wait-scope')).toHaveTextContent('database.lockWaitScope');
    const first = screen.getByTestId('monitor-infrastructure-lock-wait-row-1');
    expect(first).toHaveTextContent('9223372036854775807');
    expect(first).toHaveTextContent('alice');
    expect(first).toHaveTextContent('ShareLock');
    expect(first).toHaveTextContent('transactionid=456');
    expect(screen.getByTestId('monitor-infrastructure-lock-statement-age-1')).toHaveTextContent('8123ms');
    expect(screen.getByTestId('monitor-infrastructure-lock-statement-age-2')).toHaveTextContent(/^0ms$/);
    expect(screen.getByTestId('monitor-infrastructure-lock-statement-age-3')).toHaveTextContent('database.sourceNotProvided');
    fireEvent.focus(screen.getByTestId('monitor-infrastructure-lock-query-trigger-1'));
    const tooltip = await screen.findByTestId('monitor-infrastructure-lock-query-tooltip-1');
    expect(tooltip).toHaveTextContent('UPDATE items SET value=1');
    expect(tooltip).toHaveTextContent('database.statementStartedAt');
    view.unmount(); client.clear();
  });

  it('shows cumulative SQL identities and never labels a statistics update as last execution', async () => {
    request.mockResolvedValue({
      supported: true, db_backend: 'OPENGAUSS', status: { db: { status: 'ok' }, redis: { status: 'missing' } },
      conn_trend: { points: [] }, latency_trend: { points: [] }, lock_waits: [],
      slow_queries: [
        { query: 'SELECT $1', exec_count: 100, avg_ms: 2, total_ms: 200, query_id: '9223372036854775807', node_id: '1', node_name: 'dn1', user_id: '7', user_name: 'alice', statistics_updated_at: '2026-09-18T10:23:00.123Z' },
        { query: 'SELECT $1', exec_count: 1, avg_ms: 100, total_ms: 100, query_id: '9223372036854775806', database_id: '2', database_name: 'mail', user_id: '8', user_name: 'bob', top_level: false },
      ],
    });
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const view = render(<QueryClientProvider client={client}><DatabaseTab node="dev" range="1h" /></QueryClientProvider>);
    expect(await screen.findByTestId('monitor-infrastructure-sql-identity-1')).toHaveTextContent('9223372036854775807');
    expect(screen.getByTestId('monitor-infrastructure-sql-identity-1')).toHaveTextContent('alice');
    expect(screen.getByTestId('monitor-infrastructure-sql-identity-2')).toHaveTextContent('bob');
    expect(screen.getByTestId('monitor-infrastructure-sql-identity-2')).toHaveTextContent('database.nestedStatement');
    expect(screen.getByTestId('monitor-infrastructure-sql-ranking-scope')).toHaveTextContent('database.sqlRankingScope');
    expect(within(screen.getByTestId('monitor-infrastructure-sql-updated-1')).getByTitle('2026-09-18T10:23:00.123Z')).toHaveAttribute('datetime','2026-09-18T10:23:00.123Z');
    expect(screen.getByTestId('monitor-infrastructure-sql-updated-2')).toHaveTextContent('database.sourceNotProvided');
    expect(screen.getByRole('columnheader', { name: 'database.totalMs ↓' })).toHaveAttribute('aria-sort','descending');
    fireEvent.focus(screen.getByTestId('monitor-infrastructure-slow-query-trigger-1'));
    const lastExecuted = await screen.findByTestId('monitor-infrastructure-sql-last-executed-1');
    expect(lastExecuted).toHaveTextContent('database.lastExecutedAt: database.sourceNotProvided');
    expect(lastExecuted.querySelector('time')).toBeNull();
    view.rerender(<QueryClientProvider client={client}><DatabaseTab node="other" range="7d" /></QueryClientProvider>);
    await waitFor(() => expect(request).toHaveBeenCalledWith(expect.stringContaining('node=other&range=7d')));
    expect(await screen.findByTestId('monitor-infrastructure-sql-ranking-scope')).toBeInTheDocument();
    view.unmount(); client.clear();
  });

  it('keeps replication failures distinct from successful probes and switches scoped summaries', async () => {
    request.mockImplementation(async (url: string) => {
      const query = new URL(url, 'http://localhost').searchParams;
      const redis = query.get('source') === 'redis';
      return {
        supported: true, db_backend: 'OPENGAUSS',
        conn_trend: { points: [] }, latency_trend: { points: [] }, slow_queries: [], lock_waits: [],
        status: {
          db: { status: 'ok', replication: { node: 'dev', state: 'no_replicas', scope: 'selected_node', lag_state: 'unsupported', peers: 0 } },
          redis: { status: 'ok', latency_ms: 0, replication: { state: 'down', scope: 'selected_node', lag_state: 'unsupported', role: 'replica' } },
        },
        summary: {
          connection_scope: redis ? 'selected_node' : 'monitor_database', latency_scope: redis ? 'redis_ping_native' : 'app_db_calls',
          connections_used: redis ? 0 : 45, connections_max: redis ? 10000 : 5000,
          p50_ms: 2, p95_ms: 5, p99_ms: redis ? 0 : 12,
          states: { connections_used: 'ok', connections_max: 'ok', p50: 'ok', p95: 'missing', p99: 'ok' },
        },
      };
    });
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const view = render(<QueryClientProvider client={client}><DatabaseTab node="dev" range="1h" /></QueryClientProvider>);
    expect(await screen.findByTestId('monitor-infrastructure-summary-connections')).toHaveTextContent('45 / 5000');
    expect(screen.getByTestId('monitor-infrastructure-summary-p50')).toHaveTextContent('2.00 ms');
    expect(screen.getByTestId('monitor-infrastructure-summary-p95')).toHaveTextContent('metricStates.missing');
    expect(screen.getByTestId('monitor-infrastructure-summary-p95')).not.toHaveTextContent('5.00 ms');
    expect(screen.getByTestId('monitor-infrastructure-db-replication')).toHaveAttribute('data-state', 'no_replicas');
    expect(screen.getByTestId('monitor-infrastructure-redis-replication')).toHaveAttribute('data-state', 'down');
    expect(screen.getByTestId('monitor-infrastructure-cache-card')).toHaveClass('border-destructive');
    expect(screen.getByTestId('monitor-infrastructure-cache-card')).toHaveTextContent('PING 0ms');
    fireEvent.click(screen.getByTestId('monitor-infrastructure-db-source-redis'));
    await waitFor(() => expect(screen.getByTestId('monitor-infrastructure-summary-connections')).toHaveTextContent('0 / 10000'));
    expect(screen.queryByTestId('monitor-infrastructure-summary-p50')).not.toBeInTheDocument();
    expect(screen.getByTestId('monitor-infrastructure-summary-p99')).toHaveTextContent('0.00 ms');
    view.rerender(<QueryClientProvider client={client}><DatabaseTab node="other" range="7d" /></QueryClientProvider>);
    await waitFor(() => expect(request).toHaveBeenCalledWith(expect.stringContaining('node=other&range=7d&source=redis&metric=summary')));
    view.unmount(); client.clear();
  });

  beforeEach(() => {
    request.mockReset();
    request.mockImplementation(async (url: string) => {
      const query = new URL(url, 'http://localhost').searchParams;
      const redis = query.get('source') === 'redis';
      return {
        supported: true, db_backend: redis ? 'Redis' : 'OPENGAUSS',
        status: { db: { status: 'ok' }, redis: { status: 'ok' } },
        conn_trend: { points: [{ ts: '2026-09-15T00:00:00Z', value: redis ? 28 : 45 }] },
        // Deliberately simulate an old server returning average latency for P99.
        latency_trend: { points: [{ ts: '2026-09-15T00:00:00Z', value: 999 }] },
        slow_queries: [], lock_waits: [],
      };
    });
  });

  it('switches sources, resets unsupported Redis metrics, and never draws averages as percentiles', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const view = render(<QueryClientProvider client={client}><DatabaseTab node="dev" range="1h" /></QueryClientProvider>);
    expect(await screen.findByTestId('chart-values')).toHaveTextContent('[45]');
    expect(within(screen.getByTestId('monitor-infrastructure-database-performance-card')).getByText('database.performanceTrend')).toBeInTheDocument();
    const slowQueryCard = within(screen.getByTestId('monitor-infrastructure-slow-query-card'));
    expect(slowQueryCard.getByText('database.slowQuery')).toBeInTheDocument();
    expect(slowQueryCard.queryByTestId('monitor-infrastructure-db-source-redis')).not.toBeInTheDocument();
    fireEvent.click(screen.getByTestId('monitor-infrastructure-db-metric-p95'));
    await screen.findByTestId('monitor-infrastructure-db-metric-unavailable');
    expect(screen.queryByTestId('chart-values')).not.toBeInTheDocument();
    expect(request).toHaveBeenCalledWith(expect.stringContaining('source=db&metric=p95'));

    fireEvent.click(screen.getByTestId('monitor-infrastructure-db-source-redis'));
    expect(await screen.findByTestId('chart-values')).toHaveTextContent('[28]');
    expect(screen.queryByTestId('monitor-infrastructure-db-metric-p50')).not.toBeInTheDocument();
    expect(screen.queryByTestId('monitor-infrastructure-db-metric-p95')).not.toBeInTheDocument();
    expect(screen.getByTestId('monitor-infrastructure-db-metric-connections')).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(screen.getByTestId('monitor-infrastructure-db-metric-p99'));
    await screen.findByTestId('monitor-infrastructure-db-metric-unavailable');
    expect(request).toHaveBeenCalledWith(expect.stringContaining('source=redis&metric=p99'));

    fireEvent.click(screen.getByTestId('monitor-infrastructure-db-source-db'));
    fireEvent.click(screen.getByTestId('monitor-infrastructure-db-metric-connections'));
    expect(await screen.findByTestId('chart-values')).toHaveTextContent('[45]');
    view.rerender(<QueryClientProvider client={client}><DatabaseTab node="node2" range="7d" /></QueryClientProvider>);
    await waitFor(() => expect(request).toHaveBeenCalledWith(expect.stringContaining('node=node2&range=7d&source=db&metric=connections')));
    view.unmount();
    client.clear();
  });

  it.each([
    { slow: 'error', lock: 'ok', connection: 'ok', supported: true },
    { slow: 'unsupported', lock: 'ok', connection: 'ok', supported: true },
    { slow: 'ok', lock: 'error', connection: 'ok', supported: true },
    { slow: 'ok', lock: 'ok', connection: 'error', supported: true },
    { slow: 'error', lock: 'error', connection: 'error', supported: true },
    { slow: 'unsupported', lock: 'unsupported', connection: 'unsupported', supported: false },
    { slow: 'ok', lock: 'ok', connection: 'ok', supported: true },
  ])('isolates diagnostics: $slow / $lock / $connection', async ({ slow, lock, connection, supported }) => {
    request.mockResolvedValue({
      supported, db_backend: 'OPENGAUSS',
      degraded: [slow, lock, connection].includes('error'),
      degraded_code: [slow, lock, connection].includes('error') ? 'metrics_db_unavailable' : undefined,
      diagnostics: { slow_queries: slow, lock_waits: lock, connections: connection },
      status: { db: { status: connection === 'ok' ? 'ok' : '' }, redis: { status: 'ok', latency_ms: 2 } },
      conn_trend: { points: [{ ts: '2026-09-16T00:00:00Z', value: 45 }] },
      latency_trend: { points: [] }, slow_queries: [], lock_waits: [],
    });
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const view = render(<QueryClientProvider client={client}><DatabaseTab node="dev" range="1h" /></QueryClientProvider>);
    expect(await screen.findByTestId('chart-values')).toHaveTextContent('[45]');
    expect(screen.getByTestId('monitor-infrastructure-cache-card')).toHaveTextContent('2ms');
    expect(screen.getByTestId('monitor-infrastructure-db-source-redis')).toBeInTheDocument();
    expect(screen.queryByTestId('monitor-infrastructure-backend-unsupported')).not.toBeInTheDocument();
    const slowMessages = { ok: 'database.noSlowQueries', error: 'database.slowQueryFailed', unsupported: 'database.slowQueryUnsupported' };
    const lockMessages = { ok: 'database.noLockWaits', error: 'database.lockWaitFailed', unsupported: 'database.lockWaitUnsupported' };
    expect(screen.getByText(slowMessages[slow as keyof typeof slowMessages])).toBeInTheDocument();
    expect(screen.getByText(lockMessages[lock as keyof typeof lockMessages])).toBeInTheDocument();
    if (slow !== 'ok') expect(screen.queryByText('database.noSlowQueries')).not.toBeInTheDocument();
    if (lock !== 'ok') expect(screen.queryByText('database.noLockWaits')).not.toBeInTheDocument();
    if (connection === 'error') expect(screen.getByTestId('monitor-infrastructure-db-card')).toHaveTextContent('database.connectionQueryFailed');
    // Global degradation must not duplicate a live-DB error outside its section.
    expect(screen.queryAllByTestId('monitor-infrastructure-degraded-banner')).toHaveLength(
      [slow, lock, connection].filter((state) => state === 'error').length,
    );
    view.unmount();
    client.clear();
  });

  it('keeps successful lock rows when slow-query monitoring fails', async () => {
    request.mockResolvedValue({
      supported: true, db_backend: 'OPENGAUSS', degraded: true, degraded_code: 'metrics_db_unavailable',
      diagnostics: { slow_queries: 'error', lock_waits: 'ok', connections: 'ok' },
      status: { db: { status: 'ok' }, redis: { status: 'ok' } },
      conn_trend: { points: [] }, latency_trend: { points: [] }, slow_queries: [],
      lock_waits: [{ wait_type: 'relation', wait_object: 'mail_log', wait_ms: 12 }],
    });
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const view = render(<QueryClientProvider client={client}><DatabaseTab node="dev" range="1h" /></QueryClientProvider>);
    expect(await screen.findByText('mail_log')).toBeInTheDocument();
    expect(screen.getByTestId('monitor-infrastructure-slow-query-error')).toBeInTheDocument();
    expect(screen.queryByTestId('monitor-infrastructure-lock-wait-error')).not.toBeInTheDocument();
    view.unmount();
    client.clear();
  });

  it.each(['ok', 'missing', 'stale', 'error', 'down'] as const)('renders current %s separately from valid historical points', async (state) => {
    request.mockResolvedValue({
      supported: true, db_backend: 'OPENGAUSS',
      diagnostics: { slow_queries: 'ok', lock_waits: 'ok', connections: 'ok' },
      status: { db: { status: 'ok' }, redis: { status: state, latency_ms: state === 'ok' ? 0 : 999 } },
      // Even if a stale/old backend supplies numbers, known availability wins.
      active_conns: 0, cache_hit_ratio: 0, db_size_bytes: 0,
      metric_states: { active_conns: state, cache_hit_ratio: state, db_size_bytes: state, redis_latency: state, conn_trend: 'ok' },
      conn_trend: { points: [{ ts: '2026-09-10T00:00:00Z', value: 4 }] },
      latency_trend: { points: [] }, slow_queries: [], lock_waits: [],
    });
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const view = render(<QueryClientProvider client={client}><DatabaseTab node="dev" range="7d" /></QueryClientProvider>);
    expect(await screen.findByTestId('chart-values')).toHaveTextContent('[4]');
    for (const key of ['active_conns', 'cache_hit_ratio', 'db_size_bytes']) {
      const current = screen.getByTestId(`monitor-infrastructure-db-${key}`);
      expect(current).toHaveAttribute('data-state', state);
      if (state !== 'ok') expect(current).toHaveTextContent(`database.metricStates.${state}`);
    }
    const cache = within(screen.getByTestId('monitor-infrastructure-cache-card'));
    if (state === 'ok') {
      expect(screen.getByTestId('monitor-infrastructure-db-active_conns')).toHaveTextContent(/^0$/);
      expect(screen.getByTestId('monitor-infrastructure-db-cache_hit_ratio')).toHaveTextContent('0.0%');
      expect(cache.getByText('PING 0ms')).toBeInTheDocument();
    } else {
      expect(cache.getByText(`database.metricStates.${state}`)).toBeInTheDocument();
      expect(cache.queryByText('999ms')).not.toBeInTheDocument();
      expect(cache.queryByText('database.metricStates.ok')).not.toBeInTheDocument();
    }
    // Live database connection checks do not manufacture an unmeasured 0ms.
    expect(within(screen.getByTestId('monitor-infrastructure-db-card')).queryByText('0ms')).not.toBeInTheDocument();
    view.unmount();
    client.clear();
  });

  it('shows failed trend queries instead of a no-data or numeric chart', async () => {
    request.mockResolvedValue({
      supported: true, db_backend: 'OPENGAUSS',
      diagnostics: { slow_queries: 'ok', lock_waits: 'ok', connections: 'ok' },
      status: { db: { status: 'ok' }, redis: { status: 'missing' } },
      metric_states: { conn_trend: 'error', dml_rate: 'error' },
      conn_trend: { points: [] }, dml_rate: { points: [] }, latency_trend: { points: [] }, slow_queries: [], lock_waits: [],
    });
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const view = render(<QueryClientProvider client={client}><DatabaseTab node="dev" range="1h" /></QueryClientProvider>);
    expect(await screen.findAllByText('database.metricStates.error')).toHaveLength(2);
    expect(screen.queryByTestId('chart-values')).not.toBeInTheDocument();
    expect(screen.queryByText('noData')).not.toBeInTheDocument();
    view.unmount();
    client.clear();
  });

  it('renders connected latency metrics with the correct observation scope', async () => {
    request.mockImplementation(async (url: string) => {
      const query = new URL(url, 'http://localhost').searchParams;
      const redis = query.get('source') === 'redis';
      const metric = query.get('metric')!;
      const values: Record<string, number> = { avg_latency: 12, p50: 10, p95: 23.5, p99: 24.7 };
      return {
        supported: true, db_backend: 'OPENGAUSS',
        status: { db: { status: 'ok' }, redis: { status: 'ok' } },
        conn_trend: { points: [{ ts: '2026-09-16T00:00:00Z', value: 45 }] },
        latency_trend: { points: [{ ts: '2026-09-16T00:00:00Z', value: redis ? 2 : values[metric] ?? 12 }] },
        latency_scope: redis ? 'redis_ping_native' : 'app_db_calls',
        latency_metric: metric === 'connections' ? 'avg_latency' : metric,
        metric_states: { latency_trend: 'ok' }, slow_queries: [], lock_waits: [],
      };
    });
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const view = render(<QueryClientProvider client={client}><DatabaseTab node="dev" range="1h" /></QueryClientProvider>);
    await screen.findByTestId('chart-values');
    for (const [metric, value] of [['avg_latency', 12], ['p50', 10], ['p95', 23.5], ['p99', 24.7]] as const) {
      fireEvent.click(screen.getByTestId(`monitor-infrastructure-db-metric-${metric}`));
      await waitFor(() => expect(screen.getByTestId('chart-values')).toHaveTextContent(`[${value}]`));
      expect(screen.getByTestId('monitor-infrastructure-latency-scope')).toHaveTextContent('database.dbLatencyScope');
      expect(screen.queryByTestId('monitor-infrastructure-db-metric-unavailable')).not.toBeInTheDocument();
    }
    fireEvent.click(screen.getByTestId('monitor-infrastructure-db-source-redis'));
    await waitFor(() => expect(screen.getByTestId('chart-values')).toHaveTextContent('[2]'));
    expect(screen.getByTestId('monitor-infrastructure-latency-scope')).toHaveTextContent('database.redisLatencyScope');
    expect(screen.queryByTestId('monitor-infrastructure-db-metric-p95')).not.toBeInTheDocument();
    fireEvent.click(screen.getByTestId('monitor-infrastructure-db-metric-avg_latency'));
    await waitFor(() => expect(request).toHaveBeenCalledWith(expect.stringContaining('source=redis&metric=avg_latency')));
    view.unmount(); client.clear();
  });

  it('does not label legacy script latency as native Redis probes', async () => {
    request.mockResolvedValue({
      supported: true, db_backend: 'OPENGAUSS', status: { db: { status: 'ok' }, redis: { status: 'ok' } },
      conn_trend: { points: [] }, latency_trend: { points: [{ ts: '2026-09-17T00:00:00Z', value: 999 }] },
      latency_scope: 'redis_ping', latency_metric: 'p99', slow_queries: [], lock_waits: [],
    });
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const view = render(<QueryClientProvider client={client}><DatabaseTab node="dev" range="1h" /></QueryClientProvider>);
    fireEvent.click(await screen.findByTestId('monitor-infrastructure-db-source-redis'));
    fireEvent.click(await screen.findByTestId('monitor-infrastructure-db-metric-p99'));
    await screen.findByTestId('monitor-infrastructure-db-metric-unavailable');
    expect(screen.queryByTestId('chart-values')).not.toBeInTheDocument();
    view.unmount(); client.clear();
  });
});
