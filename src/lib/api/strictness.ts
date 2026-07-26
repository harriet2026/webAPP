// Strictness order for the layered login-security policy (GT-11959).
//
// A tenant may TIGHTEN a field relative to the platform baseline, never weaken it.
// This file is the browser-side mirror of internal/api/login_policy.go, and both
// are driven by the SAME vector file (internal/api/testdata/strictness_vectors.json)
// so they cannot drift apart unnoticed.
//
// That is not paranoia. GT-11979 shipped a closed-vs-open interval mismatch where
// the UI happily offered a date range the API then rejected with a 400. With seven
// fields, hand-writing the ordering twice and hoping is not a strategy.
//
// The subtlety is not the monotonic fields — it is the ones where 0 means
// "unlimited". A plain numeric compare ranks historyLimit=0 ABOVE historyLimit=3,
// so a tenant could switch password-history checking off entirely while the UI
// congratulated them on tightening it. Those rank as the weakest possible value.

export const NEG_INF = -Infinity;

export type StrictnessField =
  | 'minLength'
  | 'minCharClasses'
  | 'historyLimit'
  | 'passwordMaxAgeDays'
  | 'sessionTimeoutSecs'
  | 'maxOnline'
  | 'overflowPolicy';

export const OVERFLOW_KICK_EARLIEST = 'kick_earliest';
export const OVERFLOW_REJECT_NEW = 'reject_new';

/** Higher = stricter. */
export function strictnessRank(field: StrictnessField, value: number | string): number {
  switch (field) {
    case 'minLength':
    case 'minCharClasses':
      return value as number; // longer / more classes = stricter

    case 'historyLimit': {
      const n = value as number;
      return n === 0 ? NEG_INF : n; // 0 = no history check at all
    }

    case 'passwordMaxAgeDays': {
      const n = value as number;
      return n === 0 ? NEG_INF : -n; // 0 = never expires; fewer days = stricter
    }

    case 'sessionTimeoutSecs':
      return -(value as number); // shorter session = stricter

    case 'maxOnline': {
      const n = value as number;
      return n === 0 ? NEG_INF : -n; // 0 = unlimited; fewer sessions = stricter
    }

    case 'overflowPolicy':
      // reject_new keeps an attacker holding stolen credentials OUT while a
      // legitimate session is live; kick_earliest lets them in and evicts the
      // legitimate user. Not equivalent, so not a free choice for a tenant.
      return value === OVERFLOW_REJECT_NEW ? 1 : 0;

    default:
      return 0;
  }
}

/**
 * Would `value` be weaker than the platform baseline for this field?
 *
 * Used to grey out options the server would reject anyway. This is UX ONLY — the
 * server re-checks every write. A caller talking to the API directly is not
 * running our JavaScript.
 */
export function isBelowBaseline(
  field: StrictnessField,
  value: number | string,
  baseline: number | string | undefined,
): boolean {
  if (baseline === undefined || baseline === null) return false;
  return strictnessRank(field, value) < strictnessRank(field, baseline);
}
