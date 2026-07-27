import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('next-intl/middleware', () => ({
  default: () => () => new Response(null, { status: 200 }),
}));

vi.mock('next/server', () => ({
  NextResponse: {
    next: () => new Response(null, { status: 200 }),
    redirect: (url: URL) => new Response(null, {
      status: 307,
      headers: { location: url.toString() },
    }),
  },
}));

import proxy from '../../src/proxy';

function dashboardRequest(cookie?: string): Parameters<typeof proxy>[0] {
  const url = 'http://localhost/zh/dashboard';
  const token = cookie?.match(/(?:^|;\s*)osgateway_token=([^;]+)/)?.[1];
  return {
    url,
    nextUrl: { pathname: new URL(url).pathname },
    cookies: {
      get: (name: string) => (
        name === 'osgateway_token' && token
          ? { name, value: token }
          : undefined
      ),
    },
    headers: new Headers(),
  } as Parameters<typeof proxy>[0];
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('proxy demo authentication bypass', () => {
  it('redirects an anonymous request when the switcher is not explicitly true', () => {
    vi.stubEnv('OSGATEWAY_PRODUCT_FORM_SWITCHER', 'false');

    const response = proxy(dashboardRequest());

    expect(response.headers.get('location')).toBe('http://localhost/zh/login');
  });

  it.each(['true', '1', 'TRUE', 'yes'])(
    'allows an anonymous request when the switcher is %s',
    (value) => {
      vi.stubEnv('OSGATEWAY_PRODUCT_FORM_SWITCHER', value);

      const response = proxy(dashboardRequest());

      expect(response.headers.get('location')).toBeNull();
    },
  );

  it('preserves normal token-cookie authentication when bypass is disabled', () => {
    vi.stubEnv('OSGATEWAY_PRODUCT_FORM_SWITCHER', 'false');

    const response = proxy(dashboardRequest('osgateway_token=opaque-token'));

    expect(response.headers.get('location')).toBeNull();
  });
});
