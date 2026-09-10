import { describe, it, expect } from 'vitest';
import type { ProtocolChecksConfig } from '@/types/auth-spoofing';

describe('protocol observe_mode field', () => {
  it('ProtocolChecksConfig accepts four independent per-protocol observe_mode switches', () => {
    const cfg: ProtocolChecksConfig = {
      template: 'standard',
      spf_observe_mode: true,
      dkim_observe_mode: false,
      dmarc_observe_mode: true,
      ptr_observe_mode: false,
      spf: {}, dkim: {}, dmarc: {}, ptr: {},
    };
    expect(cfg.spf_observe_mode).toBe(true);
    expect(cfg.dkim_observe_mode).toBe(false);
    expect(cfg.dmarc_observe_mode).toBe(true);
    expect(cfg.ptr_observe_mode).toBe(false);
  });
});
