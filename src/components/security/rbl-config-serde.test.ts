import { describe, it, expect } from 'vitest';
import {
  RBL_CANONICAL_RULE_NAME,
  parseRblConfig,
  parseProfileValue,
  findCanonicalRule,
  buildProfileValue,
  diffRblConfig,
  mapGreylistConfig,
  unmapGreylistConfig,
  validateGreylistForm,
} from './rbl-config-serde';
import type { DetectionProfile } from '@/lib/api/detection-profiles';
import type {
  RBLFilterLegacyProductAction,
  RBLFilterProductAction,
  RBLFilterRuleView,
  RBLGreylistConfig,
} from '@/types/rbl-filter';

function profile(id: number, name: string, value?: string): DetectionProfile {
  return { id, config_type: 'rbl', name, value, is_active: true, created_at: '', updated_at: '' };
}
function canonRule(
  action: RBLFilterProductAction | RBLFilterLegacyProductAction,
  active: boolean,
): RBLFilterRuleView {
  return {
    id: 1, name: RBL_CANONICAL_RULE_NAME, description: '', match_mode: 'any', match_servers: [],
    product_action: action, action, priority: 100, is_active: active, valid_from: null, valid_until: null,
    created_at: '', updated_at: '', is_expired: false,
  };
}

describe('parseProfileValue', () => {
  it('parses timeout/retry from JSON', () => {
    expect(parseProfileValue('{"timeout_seconds":8,"retry_count":2}')).toEqual({ timeout_seconds: 8, retry_count: 2 });
  });
  it('returns {} for empty or bad JSON', () => {
    expect(parseProfileValue('')).toEqual({});
    expect(parseProfileValue('not-json')).toEqual({});
    expect(parseProfileValue(undefined)).toEqual({});
  });
});

describe('findCanonicalRule', () => {
  it('finds the canonical any-match rule by name', () => {
    const other: RBLFilterRuleView = { ...canonRule('block', true), id: 2, name: 'user-made', match_mode: 'specific' };
    expect(findCanonicalRule([other, canonRule('reject', true)])?.product_action).toBe('reject');
  });
  it('ignores same-name rule that is not match_mode any', () => {
    const weird = { ...canonRule('block', true), match_mode: 'specific' as const };
    expect(findCanonicalRule([weird])).toBeUndefined();
  });
});

describe('parseRblConfig', () => {
  const fallback = { timeout: '5', action: 'reject' as const };
  it('derives servers + timeout + action + enabled', () => {
    const cfg = parseRblConfig(
      [profile(1, 'a.rbl', '{"timeout_seconds":8}'), profile(2, 'b.rbl', '{"timeout_seconds":8}')],
      [canonRule('quarantine', true)],
      fallback,
    );
    expect(cfg).toEqual({
      enabled: true,
      servers: ['a.rbl', 'b.rbl'],
      timeout: '8',
      action: 'quarantine',
      greylistEnabled: false,
      greylist: undefined,
    });
  });
  it('falls back when no profiles/rule', () => {
    expect(parseRblConfig([], [], fallback)).toEqual({
      enabled: true,
      servers: [],
      timeout: '5',
      action: 'reject',
      greylistEnabled: false,
      greylist: undefined,
    });
  });
  // GT-12682: product_action 由 block/quarantine/mark/greylist 改为
  // reject/quarantine/review/discard + 独立的 greylistEnabled，存量规则需能读回来。
  it('maps the legacy block/mark actions onto reject', () => {
    expect(parseRblConfig([], [canonRule('block', true)], fallback).action).toBe('reject');
    expect(parseRblConfig([], [canonRule('mark', true)], fallback).action).toBe('reject');
  });
  it('preserves the greylist API contract when loading the canonical rule', () => {
    const rule = canonRule('greylist', true);
    rule.greylist = {
      mode: 'delay', delay_seconds: 600, window_seconds: 7200, max_requests: 5,
      whitelist_ttl: 24, exempt_authenticated: true, exempt_whitelisted: true, exempt_internal: false,
    };
    const cfg = parseRblConfig([], [rule], fallback);
    // 旧的 action=greylist 拆成「即时动作回落 reject + 灰名单策略开启」
    expect(cfg.action).toBe('reject');
    expect(cfg.greylistEnabled).toBe(true);
    expect(cfg.greylist).toEqual(rule.greylist);
  });
});

describe('greylist form mapping', () => {
  const apiConfig: RBLGreylistConfig = {
    mode: 'rateLimit', delay_seconds: 60, window_seconds: 300, max_requests: 10,
    whitelist_ttl: 36, exempt_authenticated: false, exempt_whitelisted: true, exempt_internal: true,
  };

  it('uses whitelist_ttl and preserves all three exemption flags', () => {
    const form = unmapGreylistConfig(apiConfig);
    expect(form).toEqual({
      mode: 'rateLimit', delaySeconds: '60', windowSeconds: '300', maxRequests: '10',
      whitelistTTL: '36', exemptAuthenticated: false, exemptWhitelisted: true, exemptInternal: true,
    });
    expect(mapGreylistConfig(form)).toEqual(apiConfig);
  });

  it('rejects decimal values and delay windows shorter than the delay', () => {
    const form = unmapGreylistConfig({ ...apiConfig, mode: 'delay', delay_seconds: 60, window_seconds: 60 });
    expect(validateGreylistForm({ ...form, delaySeconds: '10.5' })).toBe('delay');
    expect(validateGreylistForm({ ...form, windowSeconds: '59' })).toBe('windowBeforeDelay');
    expect(validateGreylistForm({ ...form, whitelistTTL: '1.5' })).toBe('ttl');
  });

  it('validates rate-limit window and request count as integers', () => {
    const form = unmapGreylistConfig(apiConfig);
    expect(validateGreylistForm({ ...form, windowSeconds: '9' })).toBe('window');
    expect(validateGreylistForm({ ...form, maxRequests: '2.5' })).toBe('maxRequests');
    expect(validateGreylistForm(form)).toBeNull();
  });
});

describe('buildProfileValue', () => {
  it('encodes timeout with default retry', () => {
    expect(JSON.parse(buildProfileValue('12'))).toEqual({ timeout_seconds: 12, retry_count: 1 });
  });
  it('defaults invalid timeout to 5', () => {
    expect(JSON.parse(buildProfileValue('abc'))).toEqual({ timeout_seconds: 5, retry_count: 1 });
  });
});

describe('diffRblConfig', () => {
  const base = [profile(1, 'keep.rbl'), profile(2, 'drop.rbl')];
  it('computes add/delete/retime sets', () => {
    const draft = { enabled: true, servers: ['keep.rbl', 'new.rbl'], timeout: '9', action: 'review' as const, greylistEnabled: false };
    expect(diffRblConfig(base, draft, true)).toEqual({
      serversToAdd: ['new.rbl'],
      profileIdsToDelete: [2],
      profilesToRetime: [1],
      action: 'review',
      greylist: undefined,
      enabled: true,
    });
  });
  it('skips retime when timeout unchanged', () => {
    const draft = { enabled: false, servers: ['keep.rbl', 'drop.rbl'], timeout: '5', action: 'reject' as const, greylistEnabled: false };
    expect(diffRblConfig(base, draft, false)).toEqual({
      serversToAdd: [], profileIdsToDelete: [], profilesToRetime: [], action: 'reject', greylist: undefined, enabled: false,
    });
  });
});
