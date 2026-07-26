import { describe, it, expect } from 'vitest';
import zh from '../../messages/zh.json';
import en from '../../messages/en.json';
import ru from '../../messages/ru.json';
import th from '../../messages/th.json';

const LOCALES = { zh, en, ru, th } as Record<string, { rblFilter?: Record<string, string> }>;
const KEYS = ['serverExists', 'serverReferenced', 'loadError', 'comingSoon'];

describe('GT-12093 RBL persistence i18n', () => {
  for (const [loc, m] of Object.entries(LOCALES)) {
    it(`${loc} has all persistence-related rblFilter keys`, () => {
      const r = m.rblFilter ?? {};
      const missing = KEYS.filter((k) => typeof r[k] !== 'string' || r[k].trim() === '');
      expect(missing).toEqual([]);
    });
  }
});
