import type { SimilarDetectionAction } from './types';

export const SIMILAR_DETECTION_ACTION_OPTIONS: ReadonlyArray<{
  value: SimilarDetectionAction;
  labelKey: 'actionAccept' | 'actionQuarantine' | 'actionAudit' | 'actionDiscard';
}> = [
  { value: 'accept', labelKey: 'actionAccept' },
  { value: 'quarantine', labelKey: 'actionQuarantine' },
  { value: 'audit', labelKey: 'actionAudit' },
  { value: 'discard', labelKey: 'actionDiscard' },
];

export function getSimilarDetectionActionOptions(_current: SimilarDetectionAction) {
  return SIMILAR_DETECTION_ACTION_OPTIONS.map((option) => ({ ...option, disabled: false }));
}
