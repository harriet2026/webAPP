import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import en from '@/../messages/en.json';
import ru from '@/../messages/ru.json';
import th from '@/../messages/th.json';
import zh from '@/../messages/zh.json';

const SOURCE = readFileSync(
  path.resolve(import.meta.dirname, 'PolicyPipelinePage.tsx'),
  'utf8',
);

describe('PolicyPipelinePage similar detection navigation summary', () => {
  it('keeps the summary fixed and avoids a config fetch (GT-14251)', () => {
    expect(SOURCE).not.toContain("getSimilarDetection");
    expect(SOURCE).not.toContain("['similar-detection-config']");
    expect(SOURCE).toContain("similarDetection: 'similarDetection.navSummary'");

    const summaries = [zh, en, ru, th].map((messages) => messages.similarDetection.navSummary);
    expect(zh.similarDetection.navSummary).toBe('检测相似邮件与重复主题');
    for (const summary of summaries) {
      expect(summary).toBeTruthy();
      expect(summary).not.toMatch(/\{(?:window|threshold)\}/);
    }
  });
});
