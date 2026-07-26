export interface ListRule {
  id: number;
  name: string;
  keywords: string[];
  scope: string[];
  enabled: boolean;
}

export function filterRules<T extends ListRule>(
  rules: T[],
  q: string,
  status: 'all' | 'enabled' | 'disabled',
  scope: 'all' | 'incoming' | 'outgoing' | 'internal',
): T[] {
  const needle = q.trim().toLowerCase();
  return rules.filter((r) => {
    if (needle) {
      const inName = r.name.toLowerCase().includes(needle);
      const inKw = r.keywords.some((k) => k.toLowerCase().includes(needle));
      if (!inName && !inKw) return false;
    }
    if (status === 'enabled' && !r.enabled) return false;
    if (status === 'disabled' && r.enabled) return false;
    if (scope !== 'all' && !r.scope.includes(scope)) return false;
    return true;
  });
}

export function foldKeywords(kw: string[]): { visible: string[]; more: number } {
  const visible = kw.slice(0, 3);
  const more = kw.length > 3 ? kw.length - 3 : 0;
  return { visible, more };
}
