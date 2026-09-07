import { describe, it, expect, vi, afterEach } from 'vitest';
import { NextRequest } from 'next/server';
import { GET, PATCH } from '../../src/app/api/v1/[[...path]]/route';

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

describe('api/v1 proxy route — PATCH forwarding (GT-13238)', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('forwards the URL, headers, and body and preserves the backend response', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response('{"error":{"code":"invalid_request"}}', {
        status: 400,
        headers: {
          'content-type': 'application/json',
          'x-backend-response': 'preserved',
        },
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const requestBody = JSON.stringify({ expected_version: 0, operations: [], document: {} });
    const req = new NextRequest('http://localhost/api/v1/configs/platform/attachd?validate=true', {
      method: 'PATCH',
      headers: {
        authorization: 'Bearer test-token',
        'content-type': 'application/json',
        'x-tenant-id': '7',
        'x-spoof-attempt': 'not-forwarded',
      },
      body: requestBody,
    });

    const response = await PATCH(req);

    expect(fetchMock).toHaveBeenCalledOnce();
    const [target, init] = fetchMock.mock.calls[0] as [URL, RequestInit];
    expect(target.toString()).toBe('http://127.0.0.1:18080/api/v1/configs/platform/attachd?validate=true');
    expect(init.method).toBe('PATCH');
    expect(init.cache).toBe('no-store');

    const headers = init.headers as Record<string, string>;
    expect(headers.authorization).toBe('Bearer test-token');
    expect(headers['content-type']).toBe('application/json');
    expect(headers['x-tenant-id']).toBe('7');
    expect(headers['x-spoof-attempt']).toBeUndefined();
    expect(new TextDecoder().decode(init.body as ArrayBuffer)).toBe(requestBody);

    expect(response.status).toBe(400);
    expect(response.headers.get('content-type')).toContain('application/json');
    expect(response.headers.get('x-backend-response')).toBe('preserved');
    await expect(response.json()).resolves.toEqual({ error: { code: 'invalid_request' } });
  });
});
