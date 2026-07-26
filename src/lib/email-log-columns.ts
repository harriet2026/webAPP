type Translator = (key: string) => string;

// Look up a localized label for an email-log column. Falls back to the raw key
// when the translation is missing (next-intl returns the key as-is in that
// case), so adding a new column doesn't require touching every locale file.
export function getColumnLabel(key: string, t: Translator): string {
  const labelKey = `logs.columns.${key}`;
  const translated = t(labelKey);
  return translated === labelKey ? key : translated;
}
