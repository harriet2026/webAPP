import { describe, expect, it } from 'vitest';
import zh from '@/../messages/zh.json';
import en from '@/../messages/en.json';
import ru from '@/../messages/ru.json';
import th from '@/../messages/th.json';

function leafKeys(value: unknown, prefix = ''): string[] {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return [prefix];
  return Object.entries(value as Record<string, unknown>).flatMap(([key, child]) => leafKeys(child, prefix ? `${prefix}.${key}` : key));
}

describe('phishing deep-module i18n parity', () => {
  for (const scope of ['phishingDetection', 'phishingConfig'] as const) {
    it(`${scope} has the same recursive key set in all four locales`, () => {
      const expected = leafKeys(zh[scope]).sort();
      for (const locale of [en, ru, th]) expect(leafKeys(locale[scope]).sort()).toEqual(expected);
    });
  }
});
