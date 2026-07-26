import { describe, expect, it } from 'vitest';
import en from '../../messages/en.json';
import ru from '../../messages/ru.json';
import th from '../../messages/th.json';
import zh from '../../messages/zh.json';
import {
  INTENT_LABEL_OPTIONS,
  intentLabelI18nKey,
} from '@/components/email-disposal/intent-label-options';

describe('email disposal intent-label filter options', () => {
  it('offers subscription and resolves the selected-condition label', () => {
    expect(INTENT_LABEL_OPTIONS).toContainEqual({
      value: 'subscription',
      labelKey: 'enumValue.intentSubscription',
    });
    expect(intentLabelI18nKey('subscription')).toBe('enumValue.intentSubscription');
  });

  it('translates subscription in every supported locale', () => {
    for (const messages of [en, ru, th, zh]) {
      expect(messages.emailDisposal.filters.enumValue.intentSubscription).toBeTruthy();
    }
  });
});
