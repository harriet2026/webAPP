import { describe, expect, it } from 'vitest';
import type {
  OverseasMailConfig,
  OverseasMailDirection,
  OverseasMailAction,
} from '@/types/overseas-mail';
import {
  OverseasMailActionLabels,
  defaultOverseasMailConfig,
} from '@/types/overseas-mail';

const DIRECTIONS: OverseasMailDirection[] = ['inbound', 'outbound', 'internal'];
const ALL_ACTIONS: OverseasMailAction[] = [
  'deliver', 'tagDeliver', 'quarantine', 'review', 'block', 'drop',
];

// GT-11901: these used to hand-roll `{enabled: false, action: 'deliver'}`, a
// copy of the shipped defaults that no production code read. Changing the real
// default left every assertion below green. Import the real thing instead.
const makeDefaultConfig = defaultOverseasMailConfig;

function isAllEnabledStrict(config: OverseasMailConfig): boolean {
  const enabled = DIRECTIONS.filter(d => config.directions[d].enabled);
  return (
    enabled.length === 3 &&
    enabled.every(d => {
      const a = config.directions[d].action;
      return a === 'block' || a === 'drop';
    })
  );
}

function isGeoIPExpired(mtime: string | undefined | null): boolean {
  if (mtime == null) return false;
  const ms = new Date(mtime).getTime();
  const now = Date.now();
  const thirtyDays = 30 * 24 * 60 * 60 * 1000;
  return now - ms > thirtyDays;
}

function resolveDirection(
  isOutbound: boolean,
  oneRcptIsInternal: boolean,
): OverseasMailDirection {
  if (!isOutbound) return 'inbound';
  if (!oneRcptIsInternal) return 'outbound';
  return 'internal';
}

const ACTION_TO_RULE: Record<OverseasMailAction, string[]> = {
  deliver: ['accept'],
  tagDeliver: ['accept', 'mark', 'add_headers'],
  quarantine: ['quarantine'],
  review: ['accept', 'audit'],
  block: ['reject'],
  drop: ['accept', 'discard'],
};

describe('Overseas Mail Config', () => {
  it('round-trips through JSON serialization', () => {
    const config: OverseasMailConfig = {
      directions: {
        inbound: { enabled: true, action: 'block' },
        outbound: { enabled: false, action: 'tagDeliver' },
        internal: { enabled: true, action: 'quarantine' },
      },
    };
    const json = JSON.stringify(config);
    const parsed = JSON.parse(json) as OverseasMailConfig;
    expect(parsed).toEqual(config);
  });

  // 2026-07-13 (overseas-geoip): inbound now ships switched ON with `block` —
  // the highest-risk direction gets protected out of the box. Outbound/internal
  // ship switched OFF but pre-select `block` too (demo-aligned all-block default,
  // matches backend DefaultOverseasMailConfigByDirection). Prior line kept for context:
  // keep the original ship-disabled-with-quarantine default.
  it('has inbound enabled with block, outbound/internal disabled with block, by default', () => {
    const config = makeDefaultConfig();
    expect(config.directions.inbound.enabled).toBe(true);
    expect(config.directions.inbound.action).toBe('block');
    for (const d of ['outbound', 'internal'] as OverseasMailDirection[]) {
      expect(config.directions[d].enabled, d).toBe(false);
      expect(config.directions[d].action, d).toBe('block');
    }
  });

  it('defines exactly 6 valid actions', () => {
    expect(ALL_ACTIONS).toHaveLength(6);
    expect(Object.keys(OverseasMailActionLabels)).toHaveLength(6);
    for (const a of ALL_ACTIONS) {
      expect(OverseasMailActionLabels[a]).toBeDefined();
    }
  });
});

describe('Strict mode warning', () => {
  it('is not strict when only 2 directions enabled', () => {
    const config: OverseasMailConfig = {
      directions: {
        inbound: { enabled: true, action: 'block' },
        outbound: { enabled: true, action: 'block' },
        internal: { enabled: false, action: 'block' },
      },
    };
    expect(isAllEnabledStrict(config)).toBe(false);
  });

  it('is not strict when all 3 enabled with deliver action', () => {
    const config: OverseasMailConfig = {
      directions: {
        inbound: { enabled: true, action: 'deliver' },
        outbound: { enabled: true, action: 'deliver' },
        internal: { enabled: true, action: 'deliver' },
      },
    };
    expect(isAllEnabledStrict(config)).toBe(false);
  });

  it('is not strict when all 3 enabled with quarantine action', () => {
    const config: OverseasMailConfig = {
      directions: {
        inbound: { enabled: true, action: 'quarantine' },
        outbound: { enabled: true, action: 'quarantine' },
        internal: { enabled: true, action: 'quarantine' },
      },
    };
    expect(isAllEnabledStrict(config)).toBe(false);
  });

  it('is not strict when all 3 enabled with tagDeliver action', () => {
    const config: OverseasMailConfig = {
      directions: {
        inbound: { enabled: true, action: 'tagDeliver' },
        outbound: { enabled: true, action: 'tagDeliver' },
        internal: { enabled: true, action: 'tagDeliver' },
      },
    };
    expect(isAllEnabledStrict(config)).toBe(false);
  });

  it('is not strict when all 3 enabled with review action', () => {
    const config: OverseasMailConfig = {
      directions: {
        inbound: { enabled: true, action: 'review' },
        outbound: { enabled: true, action: 'review' },
        internal: { enabled: true, action: 'review' },
      },
    };
    expect(isAllEnabledStrict(config)).toBe(false);
  });

  it('is strict when all 3 enabled with all block', () => {
    const config: OverseasMailConfig = {
      directions: {
        inbound: { enabled: true, action: 'block' },
        outbound: { enabled: true, action: 'block' },
        internal: { enabled: true, action: 'block' },
      },
    };
    expect(isAllEnabledStrict(config)).toBe(true);
  });

  it('is strict when all 3 enabled with all drop', () => {
    const config: OverseasMailConfig = {
      directions: {
        inbound: { enabled: true, action: 'drop' },
        outbound: { enabled: true, action: 'drop' },
        internal: { enabled: true, action: 'drop' },
      },
    };
    expect(isAllEnabledStrict(config)).toBe(true);
  });

  it('is strict when all 3 enabled with mix of block and drop', () => {
    const config: OverseasMailConfig = {
      directions: {
        inbound: { enabled: true, action: 'block' },
        outbound: { enabled: true, action: 'drop' },
        internal: { enabled: true, action: 'block' },
      },
    };
    expect(isAllEnabledStrict(config)).toBe(true);
  });

  it('is not strict when mix of block and deliver', () => {
    const config: OverseasMailConfig = {
      directions: {
        inbound: { enabled: true, action: 'block' },
        outbound: { enabled: true, action: 'deliver' },
        internal: { enabled: true, action: 'block' },
      },
    };
    expect(isAllEnabledStrict(config)).toBe(false);
  });
});

describe('GeoIP mtime 30-day threshold', () => {
  it('considers today as not expired', () => {
    expect(isGeoIPExpired(new Date().toISOString())).toBe(false);
  });

  it('considers 31 days ago as expired', () => {
    const d = new Date();
    d.setDate(d.getDate() - 31);
    expect(isGeoIPExpired(d.toISOString())).toBe(true);
  });

  it('considers undefined mtime as not expired', () => {
    expect(isGeoIPExpired(undefined)).toBe(false);
  });

  it('considers null mtime as not expired', () => {
    expect(isGeoIPExpired(null)).toBe(false);
  });
});

describe('Direction conditions are mutually exclusive', () => {
  const cases: Array<{
    isOutbound: boolean;
    oneRcptIsInternal: boolean;
    expected: OverseasMailDirection;
  }> = [
    { isOutbound: false, oneRcptIsInternal: false, expected: 'inbound' },
    { isOutbound: false, oneRcptIsInternal: true, expected: 'inbound' },
    { isOutbound: true, oneRcptIsInternal: false, expected: 'outbound' },
    { isOutbound: true, oneRcptIsInternal: true, expected: 'internal' },
  ];

  it('resolves inbound when is_outbound is false', () => {
    expect(resolveDirection(false, false)).toBe('inbound');
    expect(resolveDirection(false, true)).toBe('inbound');
  });

  it('resolves outbound when is_outbound true and rcpt is external', () => {
    expect(resolveDirection(true, false)).toBe('outbound');
  });

  it('resolves internal when is_outbound true and rcpt is internal', () => {
    expect(resolveDirection(true, true)).toBe('internal');
  });

  it('produces exactly one direction per unique combo', () => {
    const seen = new Set<string>();
    for (const c of cases) {
      const dir = resolveDirection(c.isOutbound, c.oneRcptIsInternal);
      expect(dir).toBe(c.expected);
      seen.add(dir);
    }
    expect(seen.size).toBe(3);
  });
});

describe('Action mapping completeness', () => {
  it('maps deliver to accept', () => {
    expect(ACTION_TO_RULE.deliver).toEqual(['accept']);
  });

  it('maps tagDeliver to accept + mark + add_headers', () => {
    expect(ACTION_TO_RULE.tagDeliver).toEqual(['accept', 'mark', 'add_headers']);
  });

  it('maps quarantine to quarantine', () => {
    expect(ACTION_TO_RULE.quarantine).toEqual(['quarantine']);
  });

  it('maps review to accept + audit', () => {
    expect(ACTION_TO_RULE.review).toEqual(['accept', 'audit']);
  });

  it('maps block to reject', () => {
    expect(ACTION_TO_RULE.block).toEqual(['reject']);
  });

  it('maps drop to accept + discard', () => {
    expect(ACTION_TO_RULE.drop).toEqual(['accept', 'discard']);
  });

  it('covers all 6 actions', () => {
    expect(Object.keys(ACTION_TO_RULE).sort()).toEqual(ALL_ACTIONS.sort());
  });
});

// GT-12114 Q-10：乐观锁 expected_version
describe('updateOverseasMailConfig expected_version (GT-12114 Q-10)', () => {
  it('提供 expectedVersion 时随请求体回传；未提供时不携带（兼容旧行为）', async () => {
    const { updateOverseasMailConfig } = await import('@/lib/api/overseas-mail');
    const calls: Array<{ path: string; opts?: { body?: Record<string, unknown> } }> = [];
    const fakeRequest = (async (path: string, opts?: { body?: Record<string, unknown> }) => {
      calls.push({ path, opts });
      return { directions: {}, hit_stats: { inbound: 0, outbound: 0, internal: 0 }, version: '3-x' };
    }) as unknown as typeof import('@/lib/api/client').apiRequest;

    const cfg = { directions: {} } as import('@/types/overseas-mail').OverseasMailConfig;
    await updateOverseasMailConfig(cfg, fakeRequest, undefined, '3-2026');
    expect(calls[0].opts?.body).toMatchObject({ expected_version: '3-2026' });

    await updateOverseasMailConfig(cfg, fakeRequest, undefined, undefined);
    expect(calls[1].opts?.body).not.toHaveProperty('expected_version');
  });

  it('四语均有 versionConflict 冲突文案', async () => {
    const locales = { zh: (await import('../../messages/zh.json')).default, en: (await import('../../messages/en.json')).default, th: (await import('../../messages/th.json')).default, ru: (await import('../../messages/ru.json')).default } as Record<string, { overseasMail: Record<string, string> }>;
    for (const [loc, dict] of Object.entries(locales)) {
      expect(dict.overseasMail.versionConflict, `${loc} versionConflict`).toBeTruthy();
    }
  });
});
