export type IntentLabelOption = {
  value: string;
  labelKey: string;
};

// Single source of truth for the advanced-filter dropdown and selected chips.
// Keep these values aligned with models.IntentLabelEnums on the API side.
export const INTENT_LABEL_OPTIONS: IntentLabelOption[] = [
  { value: 'phishing', labelKey: 'enumValue.intentPhishing' },
  { value: 'accountCompromised', labelKey: 'enumValue.intentAccountCompromised' },
  { value: 'maliciousAttachment', labelKey: 'enumValue.intentMaliciousAttachment' },
  { value: 'maliciousUrl', labelKey: 'enumValue.intentMaliciousUrl' },
  { value: 'normalOutgoing', labelKey: 'enumValue.intentNormalOutgoing' },
  { value: 'normalInternal', labelKey: 'enumValue.intentNormalInternal' },
  { value: 'marketing', labelKey: 'enumValue.intentMarketing' },
  { value: 'subscription', labelKey: 'enumValue.intentSubscription' },
];

const INTENT_LABEL_I18N_KEYS = new Map(
  INTENT_LABEL_OPTIONS.map(({ value, labelKey }) => [value, labelKey]),
);

export function intentLabelI18nKey(value: string): string | undefined {
  return INTENT_LABEL_I18N_KEYS.get(value);
}
