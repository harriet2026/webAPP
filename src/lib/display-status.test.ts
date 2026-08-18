import { describe, expect, it } from 'vitest';

import { resolveDisplayStatusHighlightKeys } from './display-status';

describe('resolveDisplayStatusHighlightKeys', () => {
  it('keeps current statuses and removes duplicates', () => {
    expect(
      resolveDisplayStatusHighlightKeys([
        'delivered',
        'quarantine_pending',
        'delivered',
      ]),
    ).toEqual(['delivered', 'quarantine_pending']);
  });

  it('maps legacy saved-filter values without reintroducing them into the UI enum', () => {
    expect(
      resolveDisplayStatusHighlightKeys([
        'pending_review',
        'partial_delivered',
        'partial_recall_success',
        'reviewed_rejected',
      ]),
    ).toEqual([
      'sideline_pending',
      'delivered',
      'delivery_failed',
      'recall_success',
      'recall_failed',
      'discarded',
    ]);
  });

  it('ignores unknown values', () => {
    expect(resolveDisplayStatusHighlightKeys(['not-a-real-status'])).toEqual([]);
  });
});
