import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import zh from '../../messages/zh.json';
import en from '../../messages/en.json';
import th from '../../messages/th.json';
import ru from '../../messages/ru.json';
import { ipValueErrorKeys } from '@/components/security/IPFilterPage';
import { IP_EXPRESSION_ERROR_CODES } from '@/components/security/ip-filter-expression';

// GT-12087: IPFilterPage's zod schema attaches distinct i18n keys to the
// `ip_value` field (ipAddressRequired / invalidIp / invalidCidr / cidrPrefixMax),
// but the JSX hardcoded `t('ipFilter.ipAddressRequired')` for *every* ip_value
// error. So entering an illegal IP/CIDR (e.g. 999.999.999.999/99) blocked the
// save yet showed "请输入IP地址/段" instead of the format hint the requirement
// asks for ("请输入有效的IP地址或CIDR格式"). The `valid_until` error rendered its
// raw message key ("validUntilBeforeNow") verbatim for the same reason.
//
// next-intl does not throw on a missing key — it logs MISSING_MESSAGE and renders
// the key path verbatim — and `i18n-literal-keys.test.ts` only scans *literal*
// `t('...')` calls, so a `t(`ipFilter.${message}`)` render is invisible to it.
// These assertions guard the message codes and their translations instead.
const LOCALES = { zh, en, th, ru } as Record<string, { ipFilter?: Record<string, string> }>;

const SOURCE = readFileSync(
  path.resolve(import.meta.dirname, '../../src/components/security/IPFilterPage.tsx'),
  'utf-8',
);

describe('IPFilterPage ip_value validation messages', () => {
  it('exports every message the schema can attach to ip_value', () => {
    // Guards the guard: if a new `path: ['ip_value'], message: 'x'` is added to
    // the schema but not to the exported list, the parity assertions below would
    // silently skip it. GT-11464: the expression branch attaches its message via
    // a variable (the code returned by validateIPExpressionConfig), so the
    // literal scan is complemented by IP_EXPRESSION_ERROR_CODES imported from
    // ip-filter-expression.ts — together they must equal ipValueErrorKeys.
    const emitted = new Set<string>(IP_EXPRESSION_ERROR_CODES);
    for (const [, key] of SOURCE.matchAll(/path: \['ip_value'\], message: '([A-Za-z][A-Za-z0-9]*)'/g)) {
      emitted.add(key);
    }
    expect(emitted.size).toBeGreaterThan(1);
    expect([...emitted].sort()).toEqual([...ipValueErrorKeys].sort());
  });

  it('routes ip_value errors through t() by their message code', () => {
    // The bug was a hardcoded `t('ipFilter.ipAddressRequired')`; the fix must key
    // off the actual message so invalidIp/invalidCidr/cidrPrefixMax reach the user.
    expect(SOURCE).toMatch(/t\(`ipFilter\.\$\{form\.formState\.errors\.ip_value\.message}`\)/);
  });

  it('never renders a raw validation message key', () => {
    // Strike every `.message` that IS routed through t(`ipFilter.${...}`); any
    // surviving `errors.*.message` inside a JSX expression leaks a raw key.
    const withoutTranslated = SOURCE.replace(/t\(`ipFilter\.\$\{[^`]*}`\)/g, 'TRANSLATED');
    const survivors = [...withoutTranslated.matchAll(/\{[^{}]*formState\.errors[^{}]*\.message[^{}]*\}/g)].map(
      (m) => m[0],
    );
    expect(survivors).toEqual([]);
  });

  for (const [locale, messages] of Object.entries(LOCALES)) {
    it(`${locale} translates every ip_value validation message`, () => {
      const ipFilter = messages.ipFilter ?? {};
      const missing = ipValueErrorKeys.filter(
        (key) => typeof ipFilter[key] !== 'string' || ipFilter[key].trim() === '',
      );
      expect(missing).toEqual([]);
      // valid_until's only message shares the same render path.
      expect(typeof ipFilter.validUntilBeforeNow).toBe('string');
      expect(ipFilter.validUntilBeforeNow.trim()).not.toBe('');
      // GT-11464: ip_groups' only message (zod .max) shares the same render path.
      expect(typeof ipFilter.expressionTooManyGroups).toBe('string');
      expect(ipFilter.expressionTooManyGroups.trim()).not.toBe('');
    });
  }

  it('zh shows the illegal-format hint, not the required hint', () => {
    const ipFilter = zh.ipFilter as Record<string, string>;
    // The requirement's example message and the QC regex /请输入有效的IP地址或CIDR格式|有效的IP/.
    expect(ipFilter.invalidCidr).toContain('有效的IP');
    expect(ipFilter.invalidIp).toContain('有效的IP');
    // Must be distinct from the "please enter an IP" required message.
    expect(ipFilter.invalidCidr).not.toBe(ipFilter.ipAddressRequired);
  });
});
