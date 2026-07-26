import { describe, expect, it } from 'vitest';
import en from '../../messages/en.json';
import ru from '../../messages/ru.json';
import th from '../../messages/th.json';
import zh from '../../messages/zh.json';

const locales = { zh, en, th, ru } as const;
const renderedKeys = [
  'title', 'subtitle', 'tenantScope', 'detailTitle', 'sandboxAsyncAlert', 'viewDetails',
  'tabs.link', 'tabs.attachment', 'chartType.line', 'chartType.area',
  'table.date', 'table.totalLinkMail', 'table.totalAttachmentMail',
  'side.linkTypeDistribution', 'side.urlReputationDistribution',
  'side.attachmentTypeDistribution', 'side.sandboxResultDistribution',
  'side.topMaliciousDomains', 'side.topMaliciousAttachments',
  'bottomActions.exportCsv',
];

function get(obj: unknown, path: string) {
  return path.split('.').reduce<unknown>((value, key) => (
    value && typeof value === 'object' ? (value as Record<string, unknown>)[key] : undefined
  ), obj);
}

describe('link and attachment security rendered-message parity', () => {
  for (const [locale, messages] of Object.entries(locales)) {
    for (const key of renderedKeys) {
      it(`${locale} has linkAttachmentSecurity.${key}`, () => {
        const value = get(messages.linkAttachmentSecurity, key);
        expect(typeof value === 'string' && value.length > 0, `${locale} missing ${key}`).toBe(true);
      });
    }
  }
});
