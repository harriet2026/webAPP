import { describe, it, expect } from 'vitest';
import zh from '../../messages/zh.json';
import en from '../../messages/en.json';
import th from '../../messages/th.json';
import ru from '../../messages/ru.json';

type Messages = Record<string, unknown>;

function flat(obj: unknown, prefix = ''): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries((obj as Messages) ?? {})) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === 'object') Object.assign(out, flat(v, key));
    else out[key] = String(v);
  }
  return out;
}

describe('threat-retro i18n parity', () => {
  for (const ns of ['threatRetro', 'threatRetroStrategy'] as const) {
    it(`${ns} has identical key sets across zh/en/th/ru`, () => {
      const base = Object.keys(flat((zh as Messages)[ns])).sort();
      expect(base.length, `${ns} must have at least one key`).toBeGreaterThan(0);
      for (const m of [en, th, ru]) {
        const keys = Object.keys(flat((m as Messages)[ns])).sort();
        expect(keys, `${ns} parity`).toEqual(base);
      }
    });
  }

  it('sidebar.threatRetro present in all four', () => {
    for (const m of [zh, en, th, ru]) {
      expect((m as Messages).sidebar as { threatRetro?: string }).toHaveProperty(
        'threatRetro',
        expect.any(String),
      );
    }
  });

  it('no translation value equals its key path (placeholders leaking)', () => {
    for (const m of [zh, en, th, ru]) {
      for (const ns of ['threatRetro', 'threatRetroStrategy'] as const) {
        const entries = Object.entries(flat((m as Messages)[ns]));
        for (const [k, v] of entries) {
          // Empty strings are allowed (some keys are placeholders for future);
          // but a value equal to "namespace.key" indicates a missing-translation
          // leak from next-intl.
          expect(v, `${ns} ${k}`).not.toBe(`${ns}.${k}`);
        }
      }
    }
  });
});
