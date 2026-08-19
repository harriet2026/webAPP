import { describe, expect, it } from 'vitest';
import en from '@/../messages/en.json';
import zh from '@/../messages/zh.json';
import ru from '@/../messages/ru.json';
import th from '@/../messages/th.json';

const locales = { en, zh, ru, th } as const;
const requiredKeys = [
  'title',
  'searchPlaceholder',
  'statusExpiringSoon',
  'actionDeliver',
  'actionTagDeliver',
  'actionIsolate',
  'actionReview',
  'actionBlock',
  'actionDiscard',
  'scopeDisplayHeader',
  'scopeDisplayAttachmentHash',
  'createRuleTitle',
  'editRuleTitle',
  'effectScope',
  'matchCondition',
  'actionSection',
  'remarkTitle',
  'currentEffect',
  'viewExamples',
  'simulateTest',
  'effectiveUntil',
  'directionReceiveFull',
  'directionSendFull',
  'directionInternalFull',
  'unsavedTitle',
  'editorSubtitle',
  'cardTooltipStrategy',
] as const;

describe('content rules i18n parity', () => {
  for (const [locale, messages] of Object.entries(locales)) {
    for (const key of requiredKeys) {
      it(`${locale} provides contentRules.${key}`, () => {
        const value = (messages as unknown as { contentRules?: Record<string, unknown> }).contentRules?.[key];
        expect(typeof value === 'string' && value.length > 0).toBe(true);
      });
    }
  }
});
