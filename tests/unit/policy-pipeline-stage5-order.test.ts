import { describe, it, expect, vi } from 'vitest';
import { stage5NavItems } from '@/components/security/PolicyPipelinePage';

vi.mock('@/i18n/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

describe('PolicyPipelinePage stage5 nav order', () => {
  it('advancedRules appears before mailMarking (GT-11823)', () => {
    const keys = stage5NavItems.map((item) => item.key);
    const advancedRulesIdx = keys.indexOf('advancedRules');
    const mailMarkingIdx = keys.indexOf('mailMarking');

    expect(advancedRulesIdx).toBeGreaterThanOrEqual(0);
    expect(mailMarkingIdx).toBeGreaterThanOrEqual(0);
    expect(advancedRulesIdx).toBeLessThan(mailMarkingIdx);
  });

  it('stage5 order matches demo: similarDetection -> advancedRules -> mailMarking', () => {
    const keys = stage5NavItems.map((item) => item.key);
    const similarIdx = keys.indexOf('similarDetection');
    const advancedRulesIdx = keys.indexOf('advancedRules');
    const mailMarkingIdx = keys.indexOf('mailMarking');

    expect(similarIdx).toBeLessThan(advancedRulesIdx);
    expect(advancedRulesIdx).toBeLessThan(mailMarkingIdx);
  });
});
