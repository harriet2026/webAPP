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

describe('alertCenter i18n parity', () => {
  it('alertCenter has identical key sets across zh/en/th/ru', () => {
    const base = Object.keys(flat((zh as Messages).alertCenter)).sort();
    expect(base.length, 'alertCenter must have keys').toBeGreaterThan(0);
    for (const m of [en, th, ru]) {
      const keys = Object.keys(flat((m as Messages).alertCenter)).sort();
      expect(keys, 'alertCenter parity').toEqual(base);
    }
  });

  it('sidebar.alertCenter present in all four', () => {
    for (const m of [zh, en, th, ru]) {
      expect((m as Messages).sidebar as { alertCenter?: string }).toHaveProperty(
        'alertCenter',
        expect.any(String),
      );
    }
  });

  it('no alertCenter value equals its key path (missing-translation leak)', () => {
    for (const m of [zh, en, th, ru]) {
      for (const [k, v] of Object.entries(flat((m as Messages).alertCenter))) {
        expect(v, `alertCenter ${k}`).not.toBe(`alertCenter.${k}`);
      }
    }
  });
});
