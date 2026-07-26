import type { SimilarDetectionAction } from './types';

export const SIMILAR_DETECTION_ACTION_OPTIONS: ReadonlyArray<{
  value: SimilarDetectionAction;
  labelKey: 'actionMarkDelivery' | 'actionQuarantine' | 'actionReview' | 'actionBlock' | 'actionDiscard';
}> = [
  { value: 'mark-delivery', labelKey: 'actionMarkDelivery' },
  { value: 'quarantine', labelKey: 'actionQuarantine' },
  { value: 'review', labelKey: 'actionReview' },
  { value: 'block', labelKey: 'actionBlock' },
  { value: 'discard', labelKey: 'actionDiscard' },
];
