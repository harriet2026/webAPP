import { describe, expect, it } from 'vitest';
import { createOfflineDemoBootstrap } from './offline-bootstrap';

describe('offline demo bootstrap', () => {
  it('builds a cloud bootstrap from the complete canonical registry', () => {
    const bootstrap = createOfflineDemoBootstrap('cloud');

    expect(bootstrap.form).toBe('cloud');
    expect(bootstrap.capabilities).toEqual({
      ai: true,
      multiTenant: true,
      saas: true,
    });
    expect(bootstrap.branding.deployment).toBe('saas');
    expect(bootstrap.featureRegistry).toHaveLength(41);
    expect(bootstrap.featureRegistry).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'disposal-settings',
          platformHidden: true,
        }),
        expect.objectContaining({
          id: 'forwarding',
          visibility: 'SINGLE_ONLY',
        }),
        expect.objectContaining({
          id: 'threat-retro',
          platformHidden: true,
        }),
      ]),
    );
  });

  it('falls back safely when the configured product form is invalid', () => {
    const bootstrap = createOfflineDemoBootstrap('unknown-form');

    expect(bootstrap.form).toBe('ai-multi');
    expect(bootstrap.capabilities).toEqual({
      ai: true,
      multiTenant: true,
      saas: false,
    });
  });
});
