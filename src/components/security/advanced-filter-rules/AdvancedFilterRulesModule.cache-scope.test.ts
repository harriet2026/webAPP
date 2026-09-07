import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('AdvancedFilterRulesModule tenant cache scope', () => {
  it('uses the effective tenant id for list, module state, and pending updates', () => {
    const source = readFileSync(resolve(__dirname, 'AdvancedFilterRulesModule.tsx'), 'utf8');
    expect(source).toContain("['advanced-rules', 'list', effectiveTenantId]");
    expect(source).toContain("['advanced-rules', 'enabled', effectiveTenantId]");
    expect(source).toContain('queryClient.setQueryData(enabledQueryKey, { enabled })');
    expect(source).not.toContain("setQueryData(['advanced-rules', 'enabled']");
  });
});
