import { describe, it, expect } from 'vitest';
import type { ProtocolChecksConfig } from '@/types/auth-spoofing';

describe('protocol observe_mode field', () => {
  it('ProtocolChecksConfig accepts a global observe_mode', () => {
    const cfg: ProtocolChecksConfig = {
      template: 'standard', observe_mode: true,
      spf: {}, dkim: {}, dmarc: {}, ptr: {},
    };
    expect(cfg.observe_mode).toBe(true);
  });
});
