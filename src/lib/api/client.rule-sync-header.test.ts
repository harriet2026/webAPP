import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// GT-12697: 规则变更成功响应上如果带 X-OSG-Rule-Sync: pending，说明后端还没等到
// 执行面(antispam)确认已重载新快照，几秒内会自动生效。这里验证 apiRequest 单收口
// 会为此弹一次 sonner info toast（固定 id 去重），synced/无 header 时保持静默。
// mock 形态照抄同目录 client.rule-sync-403.test.ts：直接替换 globalThis.fetch，
// 而不是 vi.stubGlobal（后者在这个仓库的既有 client 单测里没有先例）。
const toastInfo = vi.fn();
vi.mock('sonner', () => ({ toast: { info: (...args: unknown[]) => toastInfo(...args) } }));

import { apiRequest } from './client';

describe('apiRequest X-OSG-Rule-Sync pending toast (GT-12697)', () => {
  const realFetch = globalThis.fetch;

  beforeEach(() => {
    window.history.pushState({}, '', '/zh/rules/mail');
    toastInfo.mockClear();
  });

  afterEach(() => {
    globalThis.fetch = realFetch;
    vi.restoreAllMocks();
  });

  function mockFetchWithHeaders(headers: Record<string, string>) {
    globalThis.fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { 'Content-Type': 'application/json', ...headers },
      }),
    ) as unknown as typeof fetch;
  }

  it('pending header fires one info toast with stable id', async () => {
    mockFetchWithHeaders({ 'X-OSG-Rule-Sync': 'pending' });

    await apiRequest('/unified-rules/1', { method: 'DELETE' });

    expect(toastInfo).toHaveBeenCalledTimes(1);
    expect(toastInfo.mock.calls[0][1]).toMatchObject({ id: 'rule-sync-pending' });
    expect(toastInfo.mock.calls[0][0]).toContain('同步');
  });

  it('synced / absent header stays silent', async () => {
    mockFetchWithHeaders({ 'X-OSG-Rule-Sync': 'synced' });
    await apiRequest('/unified-rules/1', { method: 'DELETE' });

    mockFetchWithHeaders({});
    await apiRequest('/unified-rules/2', { method: 'DELETE' });

    expect(toastInfo).not.toHaveBeenCalled();
  });

  it('skipped header stays silent (only pending should toast)', async () => {
    mockFetchWithHeaders({ 'X-OSG-Rule-Sync': 'skipped' });
    await apiRequest('/unified-rules/1', { method: 'DELETE' });
    expect(toastInfo).not.toHaveBeenCalled();
  });

  it('localizes to English under the /en locale', async () => {
    window.history.pushState({}, '', '/en/rules/mail');
    mockFetchWithHeaders({ 'X-OSG-Rule-Sync': 'pending' });

    await apiRequest('/unified-rules/1', { method: 'DELETE' });

    expect(toastInfo).toHaveBeenCalledTimes(1);
    expect(toastInfo.mock.calls[0][0]).toMatch(/sync/i);
  });
});
