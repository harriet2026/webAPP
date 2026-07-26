import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { apiRequest, ApiError } from './client';

// GT-11966: when apiserver is unreachable the response carries no API error
// envelope (nginx 502 HTML, or fetch rejects with ERR_CONNECTION_REFUSED), so
// there is no server message to render. The fallback used to be the hardcoded
// English literal "Request failed", which surfaced verbatim in the Chinese UI.
describe('apiRequest unreachable-backend fallback (GT-11966)', () => {
  const realFetch = globalThis.fetch;

  beforeEach(() => {
    window.history.pushState({}, '', '/zh/profile');
  });

  afterEach(() => {
    globalThis.fetch = realFetch;
    vi.restoreAllMocks();
  });

  it('502 with a non-JSON body reports a localized message, not "Request failed"', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(
      new Response('<html><body>502 Bad Gateway</body></html>', {
        status: 502,
        headers: { 'Content-Type': 'text/html' },
      }),
    ) as unknown as typeof fetch;

    const err = await apiRequest('/profile/account', { method: 'PUT', body: { name: 'x' } })
      .then(() => null)
      .catch((e) => e as ApiError);

    expect(err).toBeInstanceOf(ApiError);
    expect(err!.status).toBe(502);
    expect(err!.message).not.toBe('Request failed');
    expect(err!.message).toContain('请求失败');
  });

  it('a refused connection (fetch rejects) reports a localized message', async () => {
    globalThis.fetch = vi
      .fn()
      .mockRejectedValue(new TypeError('Failed to fetch')) as unknown as typeof fetch;

    const err = await apiRequest('/profile/account')
      .then(() => null)
      .catch((e) => e as ApiError);

    expect(err).toBeInstanceOf(ApiError);
    expect(err!.message).not.toBe('Request failed');
    expect(err!.message).toContain('请求失败');
  });

  it('still surfaces the server-supplied message when the envelope is present', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ error: { code: 'conflict', message: '用户名已存在' } }), {
        status: 409,
        headers: { 'Content-Type': 'application/json' },
      }),
    ) as unknown as typeof fetch;

    const err = await apiRequest('/users', { method: 'POST', body: {} })
      .then(() => null)
      .catch((e) => e as ApiError);

    expect(err!.message).toBe('用户名已存在');
  });

  it('an aborted request still rejects with AbortError, not an ApiError', async () => {
    globalThis.fetch = vi
      .fn()
      .mockRejectedValue(new DOMException('aborted', 'AbortError')) as unknown as typeof fetch;

    const err = await apiRequest('/users')
      .then(() => null)
      .catch((e) => e as Error);

    expect(err).toBeInstanceOf(DOMException);
    expect(err!.name).toBe('AbortError');
  });

  it('falls back to the locale in the URL', async () => {
    window.history.pushState({}, '', '/en/profile');
    globalThis.fetch = vi
      .fn()
      .mockRejectedValue(new TypeError('Failed to fetch')) as unknown as typeof fetch;

    const err = await apiRequest('/profile/account')
      .then(() => null)
      .catch((e) => e as ApiError);

    expect(err!.message).toContain('temporarily unavailable');
  });
});
