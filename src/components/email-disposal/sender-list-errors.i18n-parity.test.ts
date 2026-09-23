import { describe, expect, it } from 'vitest';

import en from '@/../messages/en.json';
import ru from '@/../messages/ru.json';
import th from '@/../messages/th.json';
import zh from '@/../messages/zh.json';

const locales = { en, ru, th, zh } as const;

describe('sender-list failure messages i18n parity (GT-13651)', () => {
  for (const [locale, messages] of Object.entries(locales)) {
    it(`${locale} explains direct and combined duplicate-list failures`, () => {
      const overview = messages.emailDisposal.detail.overview;
      expect(overview.rulePartialFailWithReason).toContain('{reason}');
      expect(overview.senderActions.blacklistDialog.alreadyExists).toBeTruthy();
      expect(overview.senderActions.whitelistDialog.alreadyExists).toBeTruthy();
    });
  }
});
