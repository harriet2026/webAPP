import { describe, expect, it } from 'vitest';
import { defaultOverseasMailConfig } from './overseas-mail';

describe('defaultOverseasMailConfig', () => {
  it('defaults inbound to enabled+block, outbound/internal to disabled', () => {
    const config = defaultOverseasMailConfig();
    expect(config.directions.inbound).toEqual({ enabled: true, action: 'block' });
    expect(config.directions.outbound.enabled).toBe(false);
    expect(config.directions.internal.enabled).toBe(false);
  });
});
