import { describe, expect, it } from 'vitest';
import { cleanResponseHeaders } from './response-headers';

describe('cleanResponseHeaders', () => {
  it('forwards every Set-Cookie header, not just the last one', () => {
    // A 2FA-verify response sets BOTH the session cookie and the
    // trust-device cookie in the same response. Headers.forEach + .set()
    // collapses repeated header names, silently dropping all but one
    // Set-Cookie — this must not regress.
    const backendResp = new Response(null, {
      headers: [
        ['Set-Cookie', 'osgateway_token=abc123; Path=/; HttpOnly'],
        ['Set-Cookie', 'osg_device_trust=def456; Path=/; HttpOnly; Max-Age=2592000'],
      ],
    });

    const cleaned = cleanResponseHeaders(backendResp);
    const cookies = cleaned.getSetCookie();

    expect(cookies).toHaveLength(2);
    expect(cookies.some((c) => c.startsWith('osgateway_token=abc123'))).toBe(true);
    expect(cookies.some((c) => c.startsWith('osg_device_trust=def456'))).toBe(true);
  });

  it('drops transfer-encoding and content-encoding but keeps other headers', () => {
    const backendResp = new Response(null, {
      headers: [
        ['Transfer-Encoding', 'chunked'],
        ['Content-Encoding', 'gzip'],
        ['Content-Type', 'application/json'],
      ],
    });

    const cleaned = cleanResponseHeaders(backendResp);

    expect(cleaned.has('transfer-encoding')).toBe(false);
    expect(cleaned.has('content-encoding')).toBe(false);
    expect(cleaned.get('content-type')).toBe('application/json');
  });

  it('is a no-op for a response with no Set-Cookie headers', () => {
    const backendResp = new Response(null, { headers: [['Content-Type', 'application/json']] });
    const cleaned = cleanResponseHeaders(backendResp);
    expect(cleaned.getSetCookie()).toHaveLength(0);
  });
});
