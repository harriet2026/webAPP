import { describe, it, expect } from 'vitest';
import en from '@/../messages/en.json';
import zh from '@/../messages/zh.json';
import ru from '@/../messages/ru.json';
import th from '@/../messages/th.json';

type MsgObj = Record<string, unknown>;
const locales: Record<string, MsgObj> = { en, zh, ru, th };

// F9 (AdvancedFilterRulesModule) added the module-card description and the
// bottom info-card copy: must exist as non-empty strings in all 4 locales,
// otherwise the module card / info card render the raw i18n key.
const STRING_PATHS: string[][] = [
  ['advancedRulesFeature', 'moduleDescription'],
  ['advancedRulesFeature', 'infoCard', 'title'],
  ['advancedRulesFeature', 'infoCard', 'groupMailBasic'],
  ['advancedRulesFeature', 'infoCard', 'groupAttachment'],
  ['advancedRulesFeature', 'infoCard', 'groupSecurity'],
  ['advancedRulesFeature', 'infoCard', 'groupSystemLimit'],
];

function getPath(obj: unknown, path: string[]): unknown {
  let cur: unknown = obj;
  for (const seg of path) {
    if (cur == null || typeof cur !== 'object') return undefined;
    cur = (cur as Record<string, unknown>)[seg];
  }
  return cur;
}

describe('AdvancedFilterRulesModule i18n parity', () => {
  for (const [name, msg] of Object.entries(locales)) {
    for (const path of STRING_PATHS) {
      it(`${name} has ${path.join('.')}`, () => {
        const v = getPath(msg, path);
        expect(typeof v === 'string' && v.length > 0, `${name} missing ${path.join('.')}`).toBe(true);
      });
    }
  }

  it('moduleDescription and infoCard.title interpolate {count}', () => {
    for (const [name, msg] of Object.entries(locales)) {
      const desc = getPath(msg, ['advancedRulesFeature', 'moduleDescription']);
      const title = getPath(msg, ['advancedRulesFeature', 'infoCard', 'title']);
      expect(typeof desc === 'string' && desc.includes('{count}'), `${name} moduleDescription missing {count}`).toBe(true);
      expect(typeof title === 'string' && title.includes('{count}'), `${name} infoCard.title missing {count}`).toBe(true);
    }
  });
});
