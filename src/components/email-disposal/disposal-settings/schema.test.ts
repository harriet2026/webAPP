import { describe, it, expect } from 'vitest';
import { disposalSettingsSchema, defaultDisposalSettings } from './schema';
import { DISPOSAL_CATEGORY_KEYS, MALICIOUS_CATEGORY_KEYS } from '@/types/disposal-settings';

// 9-key category_notify default matrix (backend defaults, task-7-brief):
// malicious 5 (phishing/virus/account_compromised/spoofing/harmful) -> enabled=true, min=0.6
// spam -> enabled=true, min=0.7
// advertising/suspicious/sensitive -> enabled=false, min=0.7
// max always 1.0
describe('defaultDisposalSettings() category_notify 9-key default matrix', () => {
  const settings = defaultDisposalSettings();

  it('has exactly the 9 authoritative category keys', () => {
    expect(Object.keys(settings.quarantine.category_notify).sort()).toEqual(
      [...DISPOSAL_CATEGORY_KEYS].sort(),
    );
  });

  it.each(DISPOSAL_CATEGORY_KEYS.map((k) => [k] as const))('key %s matches backend default', (key) => {
    const entry = settings.quarantine.category_notify[key];
    const isMalicious = MALICIOUS_CATEGORY_KEYS.has(key);
    if (key === 'spam') {
      expect(entry).toEqual({ enabled: true, min_score: 0.7, max_score: 1.0 });
    } else if (isMalicious) {
      expect(entry).toEqual({ enabled: true, min_score: 0.6, max_score: 1.0 });
    } else {
      // advertising / suspicious / sensitive
      expect(entry).toEqual({ enabled: false, min_score: 0.7, max_score: 1.0 });
    }
  });

  it('defaults the notification scope arrays to empty', () => {
    expect(settings.quarantine.recipient_group_ids).toEqual([]);
    expect(settings.quarantine.department_paths).toEqual([]);
  });

  it('defaults review.custom_minutes to 15, sender_notify_on_result to true, max_recheck_minutes to 30', () => {
    expect(settings.review.custom_minutes).toBe(15);
    expect(settings.review.sender_notify_on_result).toBe(true);
    expect(settings.review.max_recheck_minutes).toBe(30);
  });
});

// max_recheck_minutes 上限须与后端 internal/api/disposal_settings.go 的强制 1-60
// 对齐（此前 schema/Input 允许到 1440，超过 60 会在保存时被后端拒绝）。
describe('disposalSettingsSchema review.max_recheck_minutes bound (1-60, backend-authoritative)', () => {
  it('accepts the upper bound 60', () => {
    const base = defaultDisposalSettings();
    base.review.max_recheck_minutes = 60;
    const res = disposalSettingsSchema.safeParse(base);
    expect(res.success).toBe(true);
  });

  it('rejects values above 60 (e.g. the old 1440 ceiling)', () => {
    const base = defaultDisposalSettings();
    base.review.max_recheck_minutes = 1440;
    const res = disposalSettingsSchema.safeParse(base);
    expect(res.success).toBe(false);
  });

  it('rejects 0 (below the lower bound 1)', () => {
    const base = defaultDisposalSettings();
    base.review.max_recheck_minutes = 0;
    const res = disposalSettingsSchema.safeParse(base);
    expect(res.success).toBe(false);
  });
});

describe('disposalSettingsSchema category_notify entry validation', () => {
  it('accepts a valid entry object per key (min <= max, both in [0,1])', () => {
    const res = disposalSettingsSchema.safeParse(defaultDisposalSettings());
    expect(res.success).toBe(true);
  });

  it('rejects min_score > max_score with an issue path scoped to the offending key', () => {
    const base = defaultDisposalSettings();
    base.quarantine.category_notify.spam = { enabled: true, min_score: 0.9, max_score: 0.5 };
    const res = disposalSettingsSchema.safeParse(base);
    expect(res.success).toBe(false);
    if (!res.success) {
      const issue = res.error.issues.find(
        (i) => i.path.join('.') === 'quarantine.category_notify.spam',
      );
      expect(issue).toBeDefined();
    }
  });

  it('rejects min_score/max_score outside [0,1]', () => {
    const base = defaultDisposalSettings();
    base.quarantine.category_notify.spam = { enabled: true, min_score: -0.1, max_score: 1.0 };
    const res = disposalSettingsSchema.safeParse(base);
    expect(res.success).toBe(false);
  });

  it('accepts recipient_group_ids as an int array and department_paths as a string array', () => {
    const base = defaultDisposalSettings();
    base.quarantine.recipient_group_ids = [1, 2, 3];
    base.quarantine.department_paths = ['研发部', '研发部 / 后端组'];
    const res = disposalSettingsSchema.safeParse(base);
    expect(res.success).toBe(true);
  });
});

// GT-12056 regression: the backend serializes tz with json:"tz,omitempty", so a
// GET for any tenant with an empty stored tz omits the key entirely. If the zod
// schema required tz, form.reset(GET) → tz=undefined → validation fails BEFORE
// onSubmit runs → Save silently no-ops for the whole page. tz is pinned
// non-empty in onSubmit, so it must never gate submission.
describe('disposalSettingsSchema tz handling (GT-12056)', () => {
  it('accepts a settings object whose tz key is absent (GET omitempty case)', () => {
    const base: Record<string, unknown> = { ...defaultDisposalSettings() };
    delete base.tz;
    const res = disposalSettingsSchema.safeParse(base);
    expect(res.success).toBe(true);
  });

  it('accepts an empty-string tz', () => {
    const res = disposalSettingsSchema.safeParse({ ...defaultDisposalSettings(), tz: '' });
    expect(res.success).toBe(true);
  });

  it('accepts a concrete IANA tz string', () => {
    const res = disposalSettingsSchema.safeParse({
      ...defaultDisposalSettings(),
      tz: 'Asia/Shanghai',
    });
    expect(res.success).toBe(true);
  });
});
