import type { Bootstrap } from '@/lib/api/bootstrap';
import registry from './__fixtures__/registry_for_test.json';
import {
  capabilitiesForForm,
  isValidForm,
  type FeatureDef,
} from './resolve';

/**
 * Bootstrap used by the explicit, backend-free demo session.
 *
 * registry_for_test.json is the browser-side mirror of
 * internal/productform.Registry; the Go/TypeScript parity test guards all 41
 * features across every form and viewer. The deployment form itself comes
 * from the webapp server's OSG_PRODUCT_FORM and is passed through the
 * dashboard server layout.
 */
export function createOfflineDemoBootstrap(configuredForm: string): Bootstrap {
  const form = isValidForm(configuredForm) ? configuredForm : 'ai-multi';
  const capabilities = capabilitiesForForm(form);

  return {
    form,
    capabilities,
    branding: { deployment: capabilities.saas ? 'saas' : 'self-hosted' },
    user: { role: 'system_admin', tenantId: null },
    featureRegistry: registry as FeatureDef[],
    grants: [],
    localAuthEnabled: true,
  };
}
