import { describe, it, expect } from 'vitest';
import type { ApiRequestFn } from '@/lib/api/client';
import {
  getRuns,
  getRunDetail,
  getThreatRetroStats,
  startScan,
  recallLeakMails,
  markFalsePositive,
  listStrategies,
  cloneStrategy,
  putAgentState,
  getModelInfo,
  bulkCancelRuns,
  exportRuns,
  previewThreatRetroNotification,
  updateStrategy,
} from '@/lib/api/threat-retro';
import { makeStrategy } from '@/components/threat-retro/strategy/strategy-defaults';

interface RequestOptions {
  method?: string;
  body?: unknown;
  headers?: Record<string, string>;
  signal?: AbortSignal;
  responseType?: 'json' | 'blob';
}

type RecordedCall = { path: string; opts: RequestOptions };

// capture() returns a plain (non-vi.fn) recorder cast to ApiRequestFn. We only
// need to inspect the recorded calls; vitest's mock assertions aren't used, so
// skipping vi.fn avoids its generic-typing friction with ApiRequestFn's <T>.
function capture(): { calls: RecordedCall[]; fn: ApiRequestFn } {
  const calls: RecordedCall[] = [];
  const fn = ((path: string, opts?: RequestOptions) => {
    calls.push({ path, opts: opts ?? {} });
    return Promise.resolve({} as never);
  }) as ApiRequestFn;
  return { calls, fn };
}

describe('threat-retro api client', () => {
  it('getRuns serializes multi filters and pagination', async () => {
    const { calls, fn } = capture();
    await getRuns(
      {
        page: 2,
        page_size: 20,
        keyword: 'RB',
        status: ['running', 'completed'],
        risk_level: ['high'],
		leak_disposition: 'has_leaks',
		time_preset: 'today',
        time_basis: 'recall_result',
        recall_outcome: 'failed',
      },
      fn,
    );
    const url = calls[0].path;
    expect(url).toContain('/threat-retro-agent/runs?');
    expect(url).toContain('page=2');
    // Backend reads `task_status` (openapi.yaml / parseRunFilters); the typed
    // client surfaces it under the `status` field but serializes to the real
    // query key.
    expect(url).toContain('task_status=running');
    expect(url).toContain('task_status=completed');
    expect(url).toContain('risk_level=high');
	expect(url).toContain('leak_disposition=has_leaks');
	expect(url).toContain('time_preset=today');
    expect(url).toContain('time_basis=recall_result');
    expect(url).toContain('recall_outcome=failed');
  });

  it('startScan POSTs strategy_id + window range', async () => {
    const { calls, fn } = capture();
    await startScan(
      {
        strategy_id: 7,
        window_start: '2026-06-18T00:00:00Z',
        window_end: '2026-06-18T08:00:00Z',
      },
      fn,
    );
    expect(calls[0].path).toBe('/threat-retro-agent/scan');
    expect(calls[0].opts.method).toBe('POST');
    expect(calls[0].opts.body).toMatchObject({ strategy_id: 7 });
  });

  it('recallLeakMails posts only mail_log_ids and cannot override snapshot policies', async () => {
    const { calls, fn } = capture();
    await recallLeakMails(
      'RB-1',
      { mail_log_ids: [11, 22] },
      fn,
    );
    expect(calls[0].path).toBe('/threat-retro-agent/runs/RB-1/recall');
    const body = calls[0].opts.body as { mail_log_ids: number[] };
    expect(body.mail_log_ids).toEqual([11, 22]);
    expect(Object.keys(body)).toEqual(['mail_log_ids']);
  });

  it('markFalsePositive posts mail_log_id + add_whitelist', async () => {
    const { calls, fn } = capture();
    await markFalsePositive('RB-1', { mail_log_id: 11, reason: 'ok', add_whitelist: true }, fn);
    expect(calls[0].path).toBe('/threat-retro-agent/runs/RB-1/false-positive');
    const body = calls[0].opts.body as { add_whitelist: boolean };
    expect(body.add_whitelist).toBe(true);
  });

  it('cloneStrategy + putAgentState use the right verbs', async () => {
    const { calls, fn } = capture();
    await cloneStrategy(5, fn);
    await putAgentState(
      { enabled: false, default_max_tool_calls: 20, default_max_url_fetches: 10 },
      fn,
    );
    expect(calls[0].path).toBe('/threat-retro-agent/strategies/5/clone');
    expect(calls[0].opts.method).toBe('POST');
    expect(calls[1].path).toBe('/threat-retro-agent/agent-state');
    expect(calls[1].opts.method).toBe('PUT');
  });

  it('bulk cancel, CSV export, and notification preview use canonical contracts', async () => {
    const { calls, fn } = capture();
    await bulkCancelRuns(['run-1', 'run-2'], fn);
    await exportRuns(['run-1'], fn);
    await previewThreatRetroNotification('digest', fn);

    expect(calls[0]).toMatchObject({
      path: '/threat-retro-agent/runs/bulk',
      opts: { method: 'POST', body: { action: 'cancel', ids: ['run-1', 'run-2'] } },
    });
    expect(calls[1]).toMatchObject({
      path: '/threat-retro-agent/runs/export',
      opts: { method: 'POST', body: { run_ids: ['run-1'] }, responseType: 'blob' },
    });
    expect(calls[2]).toMatchObject({
      path: '/threat-retro-agent/notification-preview',
      opts: { method: 'POST', body: { kind: 'digest' } },
    });
  });

  it('getRunDetail + getThreatRetroStats + getModelInfo hit the right paths', async () => {
    const { calls, fn } = capture();
    await getRunDetail('RB-9', fn);
    await getThreatRetroStats({ start: '2026-06-18T00:00:00Z' }, fn);
    await getModelInfo(fn);
    expect(calls[0].path).toBe('/threat-retro-agent/runs/RB-9');
    expect(calls[1].path).toContain('/threat-retro-agent/stats?');
    expect(calls[1].path).toContain('start=2026-06-18T00%3A00%3A00Z');
    expect(calls[2].path).toBe('/threat-retro-agent/model-info');
  });

  it('listStrategies unwraps items and parses metadata JSON', async () => {
    const meta = { mode: 'deep', schedule: { run_times: ['09:00'], weekdays: [], month_days: [] } };
    const fn = ((() =>
      Promise.resolve({ items: [{ id: 1, name: 'S1', metadata: JSON.stringify(meta) }] })) as unknown) as ApiRequestFn;
    const out = await listStrategies(fn);
    expect(out[0]).toMatchObject({ id: 1, name: 'S1', mode: 'deep' });
    expect(out[0].schedule?.run_times).toEqual(['09:00']);
  });

  it('strategy PUT omits read-only and unsupported metadata', async () => {
    const { calls, fn } = capture();
    const strategy = makeStrategy('deep');
    strategy.id = 4;
    strategy.name = 'nightly';
    strategy.stats = { triggers: 3, leaks_found: 2, recalled: 1 };
    strategy.next_run = '2026-07-12T20:00:00+08:00';
    await updateStrategy(4, strategy, fn);
    const request = calls[0].opts.body as { metadata: Record<string, unknown> };
    expect(request.metadata).not.toHaveProperty('stats');
    expect(request.metadata).not.toHaveProperty('next_run');
    expect(request.metadata).not.toHaveProperty('realtime');
  });
});
