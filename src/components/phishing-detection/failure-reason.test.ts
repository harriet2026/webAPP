import { describe, expect, it } from 'vitest';
import zh from '@/../messages/zh.json';
import en from '@/../messages/en.json';
import ru from '@/../messages/ru.json';
import th from '@/../messages/th.json';
import { PHISH_FAILURE_REASONS, phishFailureReasonKey } from './failure-reason';

// GT-14290: every public decision reason emitted by
// internal/storage/repo_phish_detection_projection.go publicPhishProjectionDecisionReason
// must have readable copy in every locale, otherwise the drawer would fall back
// to the generic sentence and hide which case happened.
describe('phishing failure reason copy', () => {
  it('lists the backend public reasons', () => {
    expect([...PHISH_FAILURE_REASONS].sort()).toEqual([
      'analysis_not_checked', 'analysis_partial', 'check_missing', 'check_result_corrupt',
      'confidence_invalid', 'confidence_missing', 'decision_undetermined', 'legacy_no_complete_snapshot',
      'observe_deadline_exceeded', 'realtime_continuation_deadline_exceeded', 'realtime_timeout_cancelled',
    ]);
  });

  it.each([['zh', zh], ['en', en], ['ru', ru], ['th', th]])('%s has copy for every reason', (_, messages) => {
    const values = (messages as { phishingDetection: { detail: { failureReasonValue: Record<string, string> } } }).phishingDetection.detail.failureReasonValue;
    for (const reason of PHISH_FAILURE_REASONS) {
      expect(values[reason], reason).toMatch(/\S/);
      expect(values[reason]).not.toContain(reason);
    }
  });

  it('maps unknown codes to the generic reason', () => {
    expect(phishFailureReasonKey('analysis_partial')).toBe('analysis_partial');
    expect(phishFailureReasonKey('something_new')).toBe('decision_undetermined');
  });
});
