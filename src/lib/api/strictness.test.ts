import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { strictnessRank, isBelowBaseline, type StrictnessField } from './strictness';

// GT-11959. This reads the SAME vector file as the Go table test
// (internal/api/login_policy_test.go). One file, two readers — that is the point.
//
// Two independent implementations of a 7-field ordering, each with its own tests,
// will agree right up until they don't. GT-11979 already shipped that failure: the
// UI offered a date range (closed interval) the API then rejected (open interval),
// and both sides' tests were green. Here the consequence would be worse than a
// 400 — a tenant admin greys out an option the server actually accepts, or vice
// versa, and the security floor moves without anyone noticing.
const VECTORS = JSON.parse(
  readFileSync(
    resolve(__dirname, '../../../../internal/api/testdata/strictness_vectors.json'),
    'utf8',
  ),
) as Record<string, unknown>;

type RankVec = { v: number | string; rank: number; why?: string };
type MergeCase = {
  field: StrictnessField;
  baseline: number | string;
  override: number | string | null;
  effective: number | string;
  why?: string;
};

const rankFields = Object.entries(VECTORS).filter(([k]) => !k.startsWith('_')) as [
  StrictnessField,
  RankVec[],
][];
const mergeCases = VECTORS['_merge_cases'] as MergeCase[];

describe('strictnessRank agrees with the shared vectors (and therefore with Go)', () => {
  it('loaded the vectors', () => {
    expect(rankFields.length).toBeGreaterThan(0);
    expect(mergeCases.length).toBeGreaterThan(0);
  });

  for (const [field, vecs] of rankFields) {
    for (const vec of vecs) {
      it(`${field} = ${JSON.stringify(vec.v)} ranks ${vec.rank}${vec.why ? ` (${vec.why})` : ''}`, () => {
        const got = strictnessRank(field, vec.v);
        // -1e308 in the JSON stands in for -Infinity (JSON has no Infinity).
        if (vec.rank <= -1e307) {
          expect(got).toBe(-Infinity);
        } else {
          expect(got).toBeCloseTo(vec.rank, 9);
        }
      });
    }
  }
});

// The three fields where a plain numeric compare gets it exactly backwards. If
// these ever rank above a real value, the UI will happily offer a tenant admin the
// option that DISABLES the check, labelled as a tightening.
describe('0 means "unlimited" and must rank weakest', () => {
  const fields: StrictnessField[] = ['historyLimit', 'passwordMaxAgeDays', 'maxOnline'];
  for (const f of fields) {
    it(`${f}: 0 is weaker than every other value`, () => {
      for (const v of [1, 10, 90, 365]) {
        expect(strictnessRank(f, 0)).toBeLessThan(strictnessRank(f, v));
      }
    });
  }
});

// isBelowBaseline drives the greying-out. It is UX only — the server re-checks
// every write — but if it is wrong in the permissive direction the admin sees an
// option that saves and then silently does not apply.
describe('isBelowBaseline mirrors the merge cases', () => {
  for (const mc of mergeCases) {
    if (mc.override === null) continue;
    const shouldBeBlocked = mc.effective !== mc.override;
    it(`${mc.field}: override ${JSON.stringify(mc.override)} vs baseline ${JSON.stringify(
      mc.baseline,
    )} -> ${shouldBeBlocked ? 'blocked' : 'allowed'}${mc.why ? ` (${mc.why})` : ''}`, () => {
      expect(isBelowBaseline(mc.field, mc.override!, mc.baseline)).toBe(shouldBeBlocked);
    });
  }

  it('an absent baseline blocks nothing', () => {
    expect(isBelowBaseline('minLength', 8, undefined)).toBe(false);
  });
});
