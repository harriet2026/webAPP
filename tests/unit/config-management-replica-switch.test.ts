import { describe, it, expect } from 'vitest';
import { isSwitchingToReplica } from '@/app/[locale]/(dashboard)/rules/config-management/page';

// Regression test for the final whole-branch review's Minor #3: the
// destructive "switching to replica" confirm must trigger regardless of how
// the admin cases the value in this generic *.cf editor. A case-sensitive
// check let "Replica"/"REPLICA" skip the confirm dialog and go straight to
// the config API, which then 400s (the backend's role comparison is an
// exact-match on lowercase "replica") with no "this replaces every local
// global rule" warning ever shown.
describe('isSwitchingToReplica', () => {
  const FILE = 'apiserver.cf';
  const SECTION = 'rule_sync';

  it('matches lowercase "replica"', () => {
    expect(isSwitchingToReplica(SECTION, 'role', 'replica', FILE)).toBe(true);
  });

  it('matches regardless of case', () => {
    expect(isSwitchingToReplica(SECTION, 'role', 'Replica', FILE)).toBe(true);
    expect(isSwitchingToReplica(SECTION, 'role', 'REPLICA', FILE)).toBe(true);
    expect(isSwitchingToReplica(SECTION, 'role', 'rEpLiCa', FILE)).toBe(true);
  });

  it('trims surrounding whitespace before comparing', () => {
    expect(isSwitchingToReplica(SECTION, 'role', '  Replica  ', FILE)).toBe(true);
  });

  it('does not match other roles', () => {
    expect(isSwitchingToReplica(SECTION, 'role', 'primary', FILE)).toBe(false);
    expect(isSwitchingToReplica(SECTION, 'role', 'standalone', FILE)).toBe(false);
    expect(isSwitchingToReplica(SECTION, 'role', 'not-a-role', FILE)).toBe(false);
  });

  it('does not match outside [rule_sync]/role in apiserver.cf', () => {
    expect(isSwitchingToReplica('other_section', 'role', 'replica', FILE)).toBe(false);
    expect(isSwitchingToReplica(SECTION, 'other_key', 'replica', FILE)).toBe(false);
    expect(isSwitchingToReplica(SECTION, 'role', 'replica', 'antispam.cf')).toBe(false);
  });
});
