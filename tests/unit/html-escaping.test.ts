import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { escapeHtml, escapeRegExp } from '@/lib/utils';

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const resolved = path.join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(resolved);
    return /\.(?:ts|tsx)$/.test(entry.name) ? [resolved] : [];
  });
}

describe('shared escaping utilities', () => {
  it('escapes every HTML-significant character, including both quote types', () => {
    expect(escapeHtml(`&<>"'`)).toBe('&amp;&lt;&gt;&quot;&#39;');
  });

  it('escapes regular-expression metacharacters', () => {
    expect(escapeRegExp('a.*+?^${}()|[]\\z')).toBe('a\\.\\*\\+\\?\\^\\$\\{\\}\\(\\)\\|\\[\\]\\\\z');
  });

  it('keeps HTML and RegExp escaping centralized in lib/utils', () => {
    const srcRoot = path.resolve(process.cwd(), 'src');
    const localDefinition = /\b(?:function|const|let|var)\s+escape(?:Html|RegExp|Re)\b/;
    const offenders = sourceFiles(srcRoot)
      .filter((file) => file !== path.join(srcRoot, 'lib', 'utils.ts'))
      .filter((file) => localDefinition.test(readFileSync(file, 'utf8')))
      .map((file) => path.relative(process.cwd(), file));

    expect(offenders).toEqual([]);
  });
});
