import { describe, it, expect } from 'vitest';
import zh from '../../messages/zh.json';
import en from '../../messages/en.json';
import th from '../../messages/th.json';
import ru from '../../messages/ru.json';
import { mapToDisplayStatus } from '@/components/email-disposal/lib/disposal-api';

// GT-11583: the disposal-center table renders the 执行动作 / 邮件状态 columns by
// looking up `emailDisposal.filters.actions.<action>` and
// `emailDisposal.filters.statuses.<displayStatus>`. A missing key does not
// throw: mail-list-table's localizeEnum falls back to the raw enum, so the cell
// silently shows English ("audit", "discard") -- exactly what this ticket
// reported. The status column is worse: it calls t() directly, so a missing key
// renders the whole key path.
//
// These tests pin the two enum domains against the catalogs so that adding a
// new action / display status without a label fails CI.

const LOCALES = { zh, en, th, ru } as Record<string, Record<string, unknown>>;

function actions(m: Record<string, unknown>): Record<string, string> {
  const ed = m.emailDisposal as { filters: { actions: Record<string, string> } };
  return ed.filters.actions;
}
function statuses(m: Record<string, unknown>): Record<string, string> {
  const ed = m.emailDisposal as { filters: { statuses: Record<string, string> } };
  return ed.filters.statuses;
}

// mail_log.action is the aggregate of the per-recipient FinalAction values:
// models.AggregateDispositionAction (internal/models/email.go) returns the sole
// action when every recipient agrees, else "mixed". The FinalAction values
// actually written are the finalAction arguments passed to
// setRecipientDisposition (internal/antispam/milter.go) and
// syncRecipientDispositions (internal/api/mail_log_disposal.go).
const ACTION_DOMAIN = [
  'accept',
  'reject',
  'bounce',
  'quarantine',
  'sideline',
  'audit', // milter setRecipientDisposition(..., "audit", ...)
  'discard', // apiserver syncRecipientDispositions(..., "discard", ...)
  'mixed', // AggregateDispositionAction when recipients disagree
] as const;

describe('emailDisposal.filters.actions covers every mail_log.action (GT-11583)', () => {
  for (const [locale, messages] of Object.entries(LOCALES)) {
    it(`${locale} has a label for every action value`, () => {
      const have = actions(messages);
      const missing = ACTION_DOMAIN.filter((a) => typeof have[a] !== 'string');
      expect(
        missing,
        `missing action labels -> the table badge falls back to the raw English enum: ${missing.join(', ')}`,
      ).toEqual([]);
    });
  }

  it('has no label for an action the backend cannot produce', () => {
    // Guards the other direction: a stale label is dead weight and misleads the
    // next reader into thinking the backend emits that value.
    const extra = Object.keys(actions(zh)).filter(
      (k) => !(ACTION_DOMAIN as readonly string[]).includes(k),
    );
    expect(extra, `unknown action labels: ${extra.join(', ')}`).toEqual([]);
  });
});

describe('emailDisposal.filters.statuses covers every DisplayStatus (GT-11583)', () => {
  // Derive the reachable DisplayStatus set from the real mapper rather than
  // restating the union type, so a new branch in mapToDisplayStatus is caught.
  const reachable = new Set<string>();
  const deliveryStates = ['delivered', 'in_delivery', 'failed', 'partial_delivered', 'cancelled', 'unknown', undefined];
  const workflowStates = [
    'released', 'approved', 'rejected_after_review', 'discarded', 'expired', 'deleted', 'none', undefined,
  ];
  const recallStates = [
    'recall_pending', 'recall_success', 'recall_failed', 'partial_recall_success', 'none', '', undefined,
  ];
  const actionStates = ['accept', 'reject', 'bounce', 'quarantine', 'sideline', 'audit', 'discard', 'mixed'];

  for (const a of actionStates) {
    for (const d of deliveryStates) {
      for (const w of workflowStates) {
        for (const r of recallStates) {
          reachable.add(mapToDisplayStatus(a, d, w, r));
        }
      }
    }
  }

  it('reaches a non-trivial number of display statuses', () => {
    expect(reachable.size).toBeGreaterThan(8);
  });

  for (const [locale, messages] of Object.entries(LOCALES)) {
    it(`${locale} has a label for every reachable display status`, () => {
      const have = statuses(messages);
      const missing = [...reachable].filter((s) => typeof have[s] !== 'string');
      expect(
        missing,
        `missing status labels -> the table renders the raw i18n key path: ${missing.join(', ')}`,
      ).toEqual([]);
    });
  }
});
