import { describe, it, expect } from 'vitest';
import { capabilitiesForForm } from '@/lib/product-form/resolve';

// The middleware edge gates derive `multiTenant` / `ai` from capabilitiesForForm.
// These assertions lock the form→capability mapping that those gates depend on,
// including the unknown-form fallback (most-restrictive → gated routes redirect).
describe('capabilitiesForForm', () => {
  it('maps every known form to its capabilities', () => {
    expect(capabilitiesForForm('cloud')).toEqual({ ai: true, multiTenant: true, saas: true });
    expect(capabilitiesForForm('ai-multi')).toEqual({ ai: true, multiTenant: true, saas: false });
    expect(capabilitiesForForm('ai-single')).toEqual({ ai: true, multiTenant: false, saas: false });
    expect(capabilitiesForForm('legacy-multi')).toEqual({ ai: false, multiTenant: true, saas: false });
    expect(capabilitiesForForm('legacy-single')).toEqual({ ai: false, multiTenant: false, saas: false });
  });

  it('falls back to all-false for unknown/empty forms (edge gates redirect)', () => {
    expect(capabilitiesForForm('nope')).toEqual({ ai: false, multiTenant: false, saas: false });
    expect(capabilitiesForForm('')).toEqual({ ai: false, multiTenant: false, saas: false });
  });

  it('reproduces the old MULTI_TENANT_FORMS / AI_FORMS gating exactly', () => {
    // Previously: MULTI_TENANT_FORMS = {cloud, ai-multi, legacy-multi},
    //             AI_FORMS         = {cloud, ai-multi, ai-single}.
    const multiTenantForms = ['cloud', 'ai-multi', 'ai-single', 'legacy-multi', 'legacy-single']
      .filter((f) => capabilitiesForForm(f).multiTenant);
    const aiForms = ['cloud', 'ai-multi', 'ai-single', 'legacy-multi', 'legacy-single']
      .filter((f) => capabilitiesForForm(f).ai);
    expect(multiTenantForms).toEqual(['cloud', 'ai-multi', 'legacy-multi']);
    expect(aiForms).toEqual(['cloud', 'ai-multi', 'ai-single']);
  });
});
