import { describe, expect, it } from 'vitest';
import { defaultOverseasMailConfig } from './overseas-mail';

describe('defaultOverseasMailConfig', () => {
  it('defaults inbound to enabled+reject, outbound/internal to disabled', () => {
    const config = defaultOverseasMailConfig();
    expect(config.directions.inbound).toEqual({ enabled: true, action: 'reject', mark_enabled: false });
    expect(config.directions.outbound.enabled).toBe(false);
    expect(config.directions.internal.enabled).toBe(false);
  });
});
