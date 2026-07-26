import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useScopedApiRequest } from './client';

// Direct unit test for useScopedApiRequest's header-injection contract:
//   tenantId !== null  → X-Tenant-ID: <tenantId>
//   tenantId === null  → no X-Tenant-ID header
// (spec §3.2 P1 gap #3 — previously only covered indirectly via
// resolveSecurityScope.)
describe('useScopedApiRequest', () => {
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  function mockFetch() {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );
    globalThis.fetch = fetchMock as unknown as typeof globalThis.fetch;
    return fetchMock;
  }

  function getCallHeaders(mock: ReturnType<typeof mockFetch>): Record<string, string> {
    const init = mock.mock.calls[0][1] as RequestInit | undefined;
    return (init?.headers ?? {}) as Record<string, string>;
  }

  it('injects X-Tenant-ID when tenantId is a number', async () => {
    const fetchMock = mockFetch();
    const { result } = renderHook(() => useScopedApiRequest(9));
    await result.current.apiRequest('/some/path');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(getCallHeaders(fetchMock)['X-Tenant-ID']).toBe('9');
  });

  it('omits X-Tenant-ID when tenantId is null', async () => {
    const fetchMock = mockFetch();
    const { result } = renderHook(() => useScopedApiRequest(null));
    await result.current.apiRequest('/some/path');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const headers = getCallHeaders(fetchMock);
    expect(headers['X-Tenant-ID']).toBeUndefined();
  });

  it('does not clobber caller-supplied headers', async () => {
    const fetchMock = mockFetch();
    const { result } = renderHook(() => useScopedApiRequest(42));
    await result.current.apiRequest('/some/path', {
      headers: { 'X-Custom': 'abc' },
    });
    const headers = getCallHeaders(fetchMock);
    expect(headers['X-Tenant-ID']).toBe('42');
    expect(headers['X-Custom']).toBe('abc');
  });

  it('passes through method and body', async () => {
    const fetchMock = mockFetch();
    const { result } = renderHook(() => useScopedApiRequest(7));
    await result.current.apiRequest<{ ok: boolean }>('/some/path', {
      method: 'POST',
      body: { x: 1 },
    });
    const init = fetchMock.mock.calls[0][1] as RequestInit;
    expect(init.method).toBe('POST');
    expect(init.body).toBe(JSON.stringify({ x: 1 }));
  });
});
