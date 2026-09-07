import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// Regression guard for the scoped-config cutover. A single click used to call
// recipient-limit-config and recipient-check-config inside Promise.all. Both
// compatibility handlers patch the same antispam row, so one request could win
// the version CAS while the other failed, leaving a partial save.
describe('RecipientCheckPage atomic save contract', () => {
  it('uses the aggregate recipient policy API for save and reset', () => {
    const source = readFileSync(resolve(__dirname, 'RecipientCheckPage.tsx'), 'utf8');
    expect(source.match(/setRecipientPolicy\(/g)).toHaveLength(2);
    expect(source).not.toContain('setRecipientLimitConfig(');
    expect(source).not.toContain('setRecipientCheckConfig(');
  });

  it('scopes every tenant-dependent query and pending cache write by tenant id', () => {
    const source = readFileSync(resolve(__dirname, 'RecipientCheckPage.tsx'), 'utf8');
    expect(source).toContain("['recipient-directory-status', effectiveTenantId]");
    expect(source).toContain("['recipient-limit-config', effectiveTenantId]");
    expect(source).toContain("['recipient-check-config', effectiveTenantId]");
    expect(source).toContain('qc.setQueryData(limitQueryKey, savedLimit)');
    expect(source).toContain('qc.setQueryData(checkQueryKey, savedCheck)');
    expect(source).toContain("['tenant-config', 'antispam', effectiveTenantId]");
  });
});
