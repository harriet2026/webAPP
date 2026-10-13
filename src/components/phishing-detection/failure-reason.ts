// Public phishing decision reasons emitted by the detection projection
// (internal/storage/repo_phish_detection_projection.go publicPhishProjectionDecisionReason).
// The drawer shows localized copy for them and keeps the raw code for the run
// log only (GT-14290); unknown codes fall back to the generic reason.
export const PHISH_FAILURE_REASONS = [
  'check_missing', 'check_result_corrupt', 'analysis_not_checked', 'analysis_partial',
  'confidence_missing', 'confidence_invalid', 'legacy_no_complete_snapshot',
  'realtime_timeout_cancelled', 'realtime_continuation_deadline_exceeded', 'observe_deadline_exceeded',
  'decision_undetermined',
] as const;

export type PhishFailureReason = typeof PHISH_FAILURE_REASONS[number];

export function phishFailureReasonKey(raw: string): PhishFailureReason {
  const value = raw.trim();
  return (PHISH_FAILURE_REASONS as readonly string[]).includes(value) ? value as PhishFailureReason : 'decision_undetermined';
}
