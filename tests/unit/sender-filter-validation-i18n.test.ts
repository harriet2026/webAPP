import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import zh from '../../messages/zh.json';
import en from '../../messages/en.json';
import th from '../../messages/th.json';
import ru from '../../messages/ru.json';
import { senderFilterErrorKeys } from '@/components/security/sender-filter/SenderFilterDrawer';

// GT-11892: the drawer's zod schema stores i18n keys in `message`
// (`z.string().min(1, 'nameRequired')`) and the JSX rendered
// `{errors.name.message}` straight out, so submitting the empty form printed
// `nameRequired` / `valueRequired` at the user. The keys never reached `t()`,
// which is why `i18n-literal-keys.test.ts` — a scanner for literal `t('...')`
// calls — could not see the bug. Two more messages were bare English sentences
// ('Priority must be at least 1'), untranslatable by construction.
const LOCALES = { zh, en, th, ru } as Record<string, { senderFilter: { errors?: Record<string, string> } }>;

const SOURCE = readFileSync(
  path.resolve(import.meta.dirname, '../../src/components/security/sender-filter/SenderFilterDrawer.tsx'),
  'utf-8',
);

describe('SenderFilterDrawer validation messages', () => {
  it('declares every message the schema can emit', () => {
    // Guards the guard: if a message key is added to the schema but not to the
    // exported list, the parity assertions below would silently skip it.
    const emitted = new Set<string>();
    for (const [, key] of SOURCE.matchAll(/message: '([A-Za-z][A-Za-z0-9]*)'/g)) emitted.add(key);
    for (const [, key] of SOURCE.matchAll(/\.(?:min|max)\([^,]+, '([A-Za-z][A-Za-z0-9]*)'\)/g)) emitted.add(key);

    expect(emitted.size).toBeGreaterThan(10);
    expect([...emitted].sort()).toEqual([...senderFilterErrorKeys].sort());
  });

  it('emits no bare English sentences as validation messages', () => {
    // 'Priority must be at least 1' shipped as a zod message and rendered
    // verbatim in every locale.
    const sentences = [...SOURCE.matchAll(/(?:message: |, )'([^']*\s[^']*)'/g)].map((m) => m[1]);
    expect(sentences).toEqual([]);
  });

  it('never renders a raw error message', () => {
    // Strike out every message that *is* routed through the errors namespace,
    // then any surviving `.message` in JSX is one that reaches the user raw.
    // (Matching the wrapped form directly is fragile: its `${...}` interpolation
    // nests braces inside the outer JSX expression.)
    const withoutTranslated = SOURCE.replace(/t\(`senderFilter\.errors\.\$\{[^`]*}`\)/g, 'TRANSLATED');
    const survivors = [...withoutTranslated.matchAll(/\{[^{}]*errors[^{}]*\.message[^{}]*\}/g)].map((m) => m[0]);
    expect(survivors).toEqual([]);
  });

  it('distinguishes the sender address from the IP address when required', () => {
    // The two fields shared one `valueRequired` key, so the sender field could
    // never say "请输入发件人地址" as the ticket asks.
    expect(senderFilterErrorKeys).toContain('senderValueRequired');
    expect(senderFilterErrorKeys).toContain('ipValueRequired');
  });

  for (const [locale, messages] of Object.entries(LOCALES)) {
    it(`${locale} translates every validation message`, () => {
      const errors = messages.senderFilter.errors ?? {};
      const missing = senderFilterErrorKeys.filter(
        (key) => typeof errors[key] !== 'string' || errors[key].trim() === '',
      );
      expect(missing).toEqual([]);
    });
  }

  it('zh spells out what the two reported fields need', () => {
    const errors = zh.senderFilter.errors as Record<string, string>;
    expect(errors.nameRequired).toContain('规则名称');
    expect(errors.senderValueRequired).toContain('发信人');
  });
});
