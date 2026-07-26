import { describe, expect, it } from 'vitest';
import { SIMILAR_DETECTION_ACTION_OPTIONS } from '@/components/security/similar-detection/action-options';

describe('similar detection action options', () => {
  it('matches the actions accepted by the similar-detection API', () => {
    expect(SIMILAR_DETECTION_ACTION_OPTIONS.map(({ value }) => value)).toEqual([
      'mark-delivery',
      'quarantine',
      'review',
      'block',
      'discard',
    ]);
  });
});
