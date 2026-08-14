import type { SimilarDetectionAction } from './types';

export const SIMILAR_DETECTION_ACTION_OPTIONS: ReadonlyArray<{
  value: SimilarDetectionAction;
  labelKey: 'actionMarkDelivery' | 'actionQuarantine' | 'actionReview' | 'actionDiscard';
}> = [
  { value: 'mark-delivery', labelKey: 'actionMarkDelivery' },
  { value: 'quarantine', labelKey: 'actionQuarantine' },
  { value: 'review', labelKey: 'actionReview' },
  { value: 'discard', labelKey: 'actionDiscard' },
];
