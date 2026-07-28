import { afterEach, describe, expect, it, vi } from 'vitest';

import { GET } from './route';

describe('HTML Spec route', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('serves the maintained HTML Spec index when developer controls are enabled', async () => {
    vi.stubEnv('OSGATEWAY_PRODUCT_FORM_SWITCHER', 'true');

    const response = await GET(
      new Request('http://localhost/html-spec/index.html'),
      { params: Promise.resolve({ path: ['index.html'] }) },
    );

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('text/html; charset=utf-8');
    expect(await response.text()).toContain('<title>HTML Spec 索引</title>');
  });

  it('does not expose the developer artifact when developer controls are disabled', async () => {
    vi.stubEnv('OSGATEWAY_PRODUCT_FORM_SWITCHER', 'false');

    const response = await GET(
      new Request('http://localhost/html-spec/index.html'),
      { params: Promise.resolve({ path: ['index.html'] }) },
    );

    expect(response.status).toBe(404);
  });
});
