const ISO_ALPHA2 = /^[A-Z]{2}$/;
const STANDARD_NAME_LOCALES = ['en', 'zh', 'ru', 'th'] as const;
const displayNamesCache = new Map<string, Intl.DisplayNames | null>();

function displayName(locale: string, code: string): string | undefined {
  let names = displayNamesCache.get(locale);
  if (names === undefined) {
    try {
      names = new Intl.DisplayNames([locale], { type: 'region' });
    } catch {
      names = null;
    }
    displayNamesCache.set(locale, names);
  }
  return names?.of(code);
}

function sameName(left: string, right: string | undefined): boolean {
  if (!right) return false;
  return left.trim().localeCompare(right.trim(), undefined, { sensitivity: 'accent' }) === 0;
}

// GeoIP persists both an ISO country code and the resolver's display name. The
// latter is normally English, so rendering it verbatim ignores the active UI
// locale. Only replace recognized standard country names: a custom GeoIP rule
// may deliberately use an operator-defined label such as "总部机房".
export function localizedGeoRegionName(locale: string, regionCode?: string, storedName?: string): string {
  const fallback = storedName?.trim() ?? '';
  const code = regionCode?.trim().toUpperCase() ?? '';
  if (!ISO_ALPHA2.test(code)) return fallback;

  const isStandardName = !fallback
    || fallback.toUpperCase() === code
    || STANDARD_NAME_LOCALES.some((candidateLocale) => sameName(fallback, displayName(candidateLocale, code)));
  if (!isStandardName) return fallback;

  return displayName(locale, code) ?? fallback;
}
