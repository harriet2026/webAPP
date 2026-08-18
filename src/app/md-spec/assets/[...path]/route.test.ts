import { afterEach, describe, expect, it, vi } from 'vitest';

import { GET } from './route';

describe('MD Spec assets route', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('serves a spec screenshot when developer controls are enabled', async () => {
    vi.stubEnv('OSGATEWAY_PRODUCT_FORM_SWITCHER', 'true');

    const response = await GET(
      new Request(
        'http://localhost/md-spec/assets/GT-12923/07-status-filter-delivered-applied.png',
      ),
      {
        params: Promise.resolve({
          path: ['GT-12923', '07-status-filter-delivered-applied.png'],
        }),
      },
    );

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('image/png');
  });

  it('does not expose the developer artifact when developer controls are disabled', async () => {
    vi.stubEnv('OSGATEWAY_PRODUCT_FORM_SWITCHER', 'false');

    const response = await GET(
      new Request(
        'http://localhost/md-spec/assets/GT-12923/07-status-filter-delivered-applied.png',
      ),
      {
        params: Promise.resolve({
          path: ['GT-12923', '07-status-filter-delivered-applied.png'],
        }),
      },
    );

    expect(response.status).toBe(404);
  });

  it('rejects path traversal attempts outside the assets root', async () => {
    vi.stubEnv('OSGATEWAY_PRODUCT_FORM_SWITCHER', 'true');

    const response = await GET(new Request('http://localhost/md-spec/assets/..%2F..%2Fpackage.json'), {
      params: Promise.resolve({ path: ['..', '..', 'package.json'] }),
    });

    expect(response.status).toBe(404);
  });

  it('returns 404 for a missing screenshot', async () => {
    vi.stubEnv('OSGATEWAY_PRODUCT_FORM_SWITCHER', 'true');

    const response = await GET(new Request('http://localhost/md-spec/assets/GT-12923/does-not-exist.png'), {
      params: Promise.resolve({ path: ['GT-12923', 'does-not-exist.png'] }),
    });

    expect(response.status).toBe(404);
  });
});
