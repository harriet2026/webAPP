import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import zh from '../../messages/zh.json';
import en from '../../messages/en.json';
import { mapMailLogToDisposalItem } from '@/components/email-disposal/lib/disposal-api';

// GT-11917: several components resolved i18n keys that did not exist in the
// message catalogs. next-intl does not throw on a missing key — it logs
// MISSING_MESSAGE and renders the key path verbatim — so the raw key leaks
// into the UI ("emailDisposal.filters.reset" instead of "重置") and no test
// notices. These tests statically resolve every literal t('...') call under
// src/ against the zh and en catalogs so a missing key fails CI instead.
//
// Scope limits, deliberate:
//   - zh and en only. th and ru have large pre-existing gaps in other modules.
//   - Literal keys only. A template key such as t(`filters.${direction}`) is
//     not statically resolvable; the mapMailLogToDisposalItem test below covers
//     the one such site this ticket found.
//   - Files that bind the same variable name to two different namespaces are
//     skipped, since a purely lexical scan cannot tell which binding is in
//     scope at a given call.

const SRC = path.resolve(__dirname, '../../src');

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) {
      out.push(...walk(full));
    } else if (/\.tsx?$/.test(entry) && !/\.test\.tsx?$/.test(entry)) {
      out.push(full);
    }
  }
  return out;
}

/** Resolve a dotted path; returns undefined for a missing key and null for a namespace object. */
function resolve(messages: unknown, dotted: string): string | undefined | null {
  let cur: unknown = messages;
  for (const seg of dotted.split('.')) {
    if (typeof cur !== 'object' || cur === null || !(seg in cur)) return undefined;
    cur = (cur as Record<string, unknown>)[seg];
  }
  return typeof cur === 'string' ? cur : null;
}

/** Every literal `tX('some.key')` call, resolved against the file's useTranslations namespace. */
function literalKeys(source: string): string[] {
  const bindings = new Map<string, Set<string>>();
  // Both quote styles: Prettier/editors reformat files to double quotes, and a
  // single-quote-only regex silently drops such files from the guard entirely
  // (that is how relay-grants-card.tsx escaped coverage in GT-12235).
  const nsRe =
    /const\s+(\w+)\s*=\s*useTranslations\(\s*(?:'([^']*)'|"([^"]*)")?\s*\)/g;
  for (let m = nsRe.exec(source); m; m = nsRe.exec(source)) {
    const set = bindings.get(m[1]) ?? new Set<string>();
    set.add(m[2] ?? m[3] ?? ''); // useTranslations() with no argument is the root namespace
    bindings.set(m[1], set);
  }
  const keys: string[] = [];
  for (const [varName, namespaces] of bindings) {
    if (namespaces.size > 1) continue; // ambiguous; see scope note above
    const ns = [...namespaces][0];
    // The lookbehind keeps `t(` from matching inside `ft(` / `tCommon(`; the
    // lookahead keeps `t('a.' + x)` (string concat) from being read as a key.
    const callRe = new RegExp(
      `(?<![A-Za-z0-9_])${varName}\\((?:'([A-Za-z0-9_.]+)'|"([A-Za-z0-9_.]+)")\\s*(?=[),])`,
      'g',
    );
    for (let m = callRe.exec(source); m; m = callRe.exec(source)) {
      const key = m[1] ?? m[2];
      keys.push(ns ? `${ns}.${key}` : key);
    }
  }
  return keys;
}

describe('literal i18n keys resolve (GT-11917)', () => {
  const files = walk(SRC);

  it('scans the whole component tree', () => {
    expect(files.length).toBeGreaterThan(200);
  });

  for (const [locale, messages] of [['zh', zh], ['en', en]] as const) {
    it(`every literal t() key under src/ resolves to a string in ${locale}`, () => {
      const bad: string[] = [];
      for (const file of files) {
        for (const key of literalKeys(readFileSync(file, 'utf8'))) {
          const value = resolve(messages, key);
          if (value === undefined) {
            bad.push(`${path.relative(SRC, file)}: "${key}" is missing`);
          } else if (value === null) {
            bad.push(`${path.relative(SRC, file)}: "${key}" resolves to a namespace, not a string`);
          }
        }
      }
      expect(bad, `raw i18n keys would leak into the UI:\n${bad.join('\n')}`).toEqual([]);
    });
  }
});

describe('mapMailLogToDisposalItem direction (GT-11917)', () => {
  const base = { id: 1, sender: 'a@b.com', subject: 's', action: 'accept', status: 'ok' };

  it('emits direction values that exist under emailDisposal.filters', () => {
    const inbound = mapMailLogToDisposalItem({ ...base } as never);
    const outbound = mapMailLogToDisposalItem({ ...base, authenticated: true } as never);

    expect(inbound.direction).toBe('incoming');
    expect(outbound.direction).toBe('outgoing');

    for (const messages of [zh, en]) {
      for (const item of [inbound, outbound]) {
        expect(
          resolve(messages, `emailDisposal.filters.${item.direction}`),
          `emailDisposal.filters.${item.direction}`,
        ).toEqual(expect.any(String));
      }
    }
  });

  it('treats an smtp_user as outbound', () => {
    const item = mapMailLogToDisposalItem({ ...base, smtp_user: 'u' } as never);
    expect(item.direction).toBe('outgoing');
  });
});
