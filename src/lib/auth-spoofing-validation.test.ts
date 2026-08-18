import { describe, expect, it } from 'vitest';
import type { AuthSpoofingConfig, CheckItem } from '@/types/auth-spoofing';
import { hasEmptyAuthSpoofingTag } from './auth-spoofing-validation';

const item = (overrides: Partial<CheckItem> = {}): CheckItem => ({
  enabled: true,
  action: 'quarantine',
  observe_mode: false,
  ...overrides,
});

function config(): AuthSpoofingConfig {
  return {
    format_checks: {
      mailfrom_empty: item(),
      mailfrom_invalid: item(),
      envelope_header_mismatch: item(),
    },
    protocol_checks: {
      template: 'custom',
      observe_mode: false,
      spf: { fail: item() },
      dkim: { fail: item() },
      dmarc: { reject: item() },
      ptr: { noptr: item() },
    },
    similar_domain: {
      enabled: false,
      action: 'quarantine',
      observe_mode: false,
      threshold: 2,
      protected_domains: [],
    },
    display_name_spoof: {
      inbound: item(),
      outbound: item(),
      internal: item(),
      internal_users: [],
    },
  };
}

describe('hasEmptyAuthSpoofingTag', () => {
  it('rejects an enabled subject tag whose content is empty or whitespace', () => {
    const cfg = config();
    cfg.format_checks.mailfrom_empty = item({
      action: 'mark-delivery',
      tag_subject_enabled: true,
      tag_subject_content: '   ',
    });

    expect(hasEmptyAuthSpoofingTag(cfg)).toBe(true);
  });

  it('checks header and body tags across protocol, similar-domain, and display-name sections', () => {
    const cases: Array<(cfg: AuthSpoofingConfig) => void> = [
      (cfg) => {
        cfg.protocol_checks.spf.fail = item({
          action: 'mark-delivery',
          tag_header_enabled: true,
          tag_header_name: 'X-Spoof-Warning',
          tag_header_value: '',
        });
      },
      (cfg) => {
        cfg.similar_domain = {
          ...cfg.similar_domain,
          enabled: true,
          action: 'mark-delivery',
          tag_body_enabled: true,
          tag_body_content: '',
        };
      },
      (cfg) => {
        cfg.display_name_spoof.internal = item({
          action: 'mark-delivery',
          tag_subject_enabled: true,
          tag_subject_content: '',
        });
      },
    ];

    for (const makeInvalid of cases) {
      const cfg = config();
      makeInvalid(cfg);
      expect(hasEmptyAuthSpoofingTag(cfg)).toBe(true);
    }
  });

  it('allows pure mark-delivery and ignores tag fields on inactive items', () => {
    const cfg = config();
    cfg.format_checks.mailfrom_empty = item({ action: 'mark-delivery' });
    cfg.protocol_checks.spf.fail = item({
      enabled: false,
      action: 'mark-delivery',
      tag_subject_enabled: true,
      tag_subject_content: '',
    });

    expect(hasEmptyAuthSpoofingTag(cfg)).toBe(false);
  });

  it('accepts complete enabled tag fields', () => {
    const cfg = config();
    cfg.format_checks.mailfrom_empty = item({
      action: 'mark-delivery',
      tag_subject_enabled: true,
      tag_subject_content: '[疑似仿冒]',
      tag_header_enabled: true,
      tag_header_name: 'X-Spoof-Warning',
      tag_header_value: '1',
      tag_body_enabled: true,
      tag_body_content: '请谨慎核验发件人身份',
    });

    expect(hasEmptyAuthSpoofingTag(cfg)).toBe(false);
  });
});
