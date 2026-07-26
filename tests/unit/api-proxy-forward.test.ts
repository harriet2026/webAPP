import { describe, it, expect, vi, afterEach } from 'vitest';
import { NextRequest } from 'next/server';
import { GET } from '../../src/app/api/v1/[[...path]]/route';

describe('api/v1 proxy route — client IP forwarding (GT-11458)', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  function stubFetch() {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response('{}', {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );
    vi.stubGlobal('fetch', fetchMock);
    return fetchMock;
  }

  it('forwards X-Forwarded-For / X-Real-IP to the backend', async () => {
    const fetchMock = stubFetch();
    const req = new NextRequest('http://localhost/api/v1/admin-audit?page=1', {
      headers: {
        'x-forwarded-for': '203.0.113.9',
        'x-real-ip': '203.0.113.9',
        cookie: 'a=b',
      },
    });

    await GET(req);

    expect(fetchMock).toHaveBeenCalledOnce();
    const [, init] = fetchMock.mock.calls[0] as [URL, RequestInit];
    const headers = init.headers as Record<string, string>;
    expect(headers['x-forwarded-for']).toBe('203.0.113.9');
    expect(headers['x-real-ip']).toBe('203.0.113.9');
    expect(headers.cookie).toBe('a=b');
  });

  it('still forwards auth/tenant headers and omits others', async () => {
    const fetchMock = stubFetch();
    const req = new NextRequest('http://localhost/api/v1/users', {
      headers: {
        'x-forwarded-for': '198.51.100.4',
        authorization: 'Bearer t',
        'x-tenant-id': '7',
        'x-spoof-attempt': 'nope',
      },
    });

    await GET(req);

    const [, init] = fetchMock.mock.calls[0] as [URL, RequestInit];
    const headers = init.headers as Record<string, string>;
    expect(headers['x-forwarded-for']).toBe('198.51.100.4');
    expect(headers.authorization).toBe('Bearer t');
    expect(headers['x-tenant-id']).toBe('7');
    expect(headers['x-spoof-attempt']).toBeUndefined();
  });
});
