import { describe, expect, it, vi } from 'vitest';
import { stage3NavItems, stage3PipelinePolicies } from '@/components/security/PolicyPipelinePage';

vi.mock('@/i18n/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

describe('PolicyPipelinePage stage3 order (GT-12938)', () => {
  const expected = ['content', 'attachment', 'url', 'intentEngine'];

  it('puts content rules first in the stage card', () => {
    expect(stage3PipelinePolicies.map(({ key }) => key)).toEqual(expected);
  });

  it('keeps drawer navigation in the same order as the stage card', () => {
    expect(stage3NavItems.map(({ key }) => key)).toEqual(expected);
  });
});
