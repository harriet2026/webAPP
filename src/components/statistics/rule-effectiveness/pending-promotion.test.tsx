import { fireEvent, render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { describe, expect, it } from 'vitest';
import zh from '@/../messages/zh.json';
import type { RuleEffectivenessRow } from '@/lib/api/rule-effectiveness-view';
import { isPendingPromotion } from './constants';
import { ObserveTimeoutAlert } from './ObserveTimeoutAlert';

describe('GT-14328 pending promotion', () => {
  it('uses server current-period eligibility, not selected-window hits', () => {
    expect(isPendingPromotion({ observed_days: 31, hits: 0, pending_review: true })).toBe(true);
    expect(isPendingPromotion({ observed_days: 40, hits: 3, pending_review: false })).toBe(false);
    expect(isPendingPromotion({ observed_days: 29, hits: 1 })).toBe(false);
    expect(isPendingPromotion({ observed_days: 30, hits: 1 })).toBe(false);
    expect(isPendingPromotion({ observed_days: 31, hits: 0 })).toBe(false);
    expect(isPendingPromotion({ observed_days: 31, hits: 1 })).toBe(true);
  });

  it('keeps the warning and drawer on the same eligible set, including older hits', () => {
    const rows = [
      { id: 'eligible', observed_days: 31, hits: 0, pending_review: true },
      { id: 'no-hits', observed_days: 40, hits: 0, pending_review: false },
      { id: 'day30', observed_days: 30, hits: 2, pending_review: false },
    ].map(row => ({ ...row, policy_module: 'similar_detection', sub_strategy_id: 'same_subject.receive', similar_detection_type: 'same_subject', similar_detection_scope: 'receive' })) as RuleEffectivenessRow[];
    render(<NextIntlClientProvider locale="zh" messages={zh}><ObserveTimeoutAlert rows={rows} onNavigateToConfig={() => {}} /></NextIntlClientProvider>);
    expect(screen.getByTestId('rule-effectiveness-timeout-alert')).toBeVisible();
    fireEvent.click(screen.getByTestId('rule-effectiveness-timeout-view'));
    expect(screen.getByTestId('rule-effectiveness-timeout-row-eligible')).toBeVisible();
    expect(screen.queryByTestId('rule-effectiveness-timeout-row-no-hits')).not.toBeInTheDocument();
    expect(screen.queryByTestId('rule-effectiveness-timeout-row-day30')).not.toBeInTheDocument();
  });
});
