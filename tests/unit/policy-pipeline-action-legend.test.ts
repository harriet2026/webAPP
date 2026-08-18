import { describe, it, expect, vi } from 'vitest';
import { actionLegendItems } from '@/components/security/PolicyPipelinePage';
import zh from '../../messages/zh.json';
import en from '../../messages/en.json';
import th from '../../messages/th.json';
import ru from '../../messages/ru.json';

vi.mock('@/i18n/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

// GT-11894: the pipeline page's action legend hard-coded four entries —
// deliver / quarantine / block / drop — and rendered each as a bare label. The
// gateway has always acted on six (tagDeliver and review were missing), and the
// prototype pairs every swatch with a one-line description of what the action
// does. The legend is the only place the page explains its colour coding, so a
// missing entry means a colour appears in the diagram with nothing to decode it.
//
// GT-12719: the second entry became "nextStep"（进行下一步）—— the legend no
// longer advertises tagDeliver as a pipeline outcome, it explains that the mail
// keeps flowing into the following policies.
const EXPECTED_ORDER = ['deliver', 'nextStep', 'quarantine', 'review', 'block', 'drop'];

const LOCALES = { zh, en, th, ru } as Record<string, { pipeline: Record<string, string> }>;

describe('PolicyPipelinePage action legend', () => {
  it('lists all six gateway actions in prototype order', () => {
    expect(actionLegendItems.map((item) => item.key)).toEqual(EXPECTED_ORDER);
  });

  it('gives every action a distinct colour token', () => {
    const colors = actionLegendItems.map((item) => item.color);
    expect(new Set(colors).size).toBe(actionLegendItems.length);
    for (const color of colors) {
      expect(color).toMatch(/^var\(--action-[a-z-]+\)$/);
    }
  });

  it('pairs every action with a label key and a description key', () => {
    for (const item of actionLegendItems) {
      expect(item.labelKey, item.key).toMatch(/^pipeline\.action/);
      expect(item.descKey, item.key).toMatch(/^pipeline\.action.*Desc$/);
      expect(item.descKey, item.key).not.toBe(item.labelKey);
    }
  });

  for (const [locale, messages] of Object.entries(LOCALES)) {
    it(`${locale} translates every legend label and description`, () => {
      const missing: string[] = [];
      for (const item of actionLegendItems) {
        for (const key of [item.labelKey, item.descKey]) {
          const leaf = key.slice('pipeline.'.length);
          const value = messages.pipeline[leaf];
          if (typeof value !== 'string' || value.trim() === '') missing.push(key);
        }
      }
      expect(missing).toEqual([]);
    });
  }

  it('describes each action rather than restating its name', () => {
    // The bug shipped labels with no descriptions at all; a description that
    // merely echoes the label would satisfy a key-presence check but tell the
    // operator nothing.
    for (const item of actionLegendItems) {
      const label = zh.pipeline[item.labelKey.slice('pipeline.'.length) as keyof typeof zh.pipeline];
      const desc = zh.pipeline[item.descKey.slice('pipeline.'.length) as keyof typeof zh.pipeline];
      expect(desc, item.key).not.toBe(label);
      expect((desc as string).length, item.key).toBeGreaterThan(3);
    }
  });
});
