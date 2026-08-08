'use client';

// TEMPORARY dev-only route used to regenerate the GT-12826 documentation
// screenshots (doc/html_spec-version/screenshots/gt12826-*.png) with correct
// CJK font rendering. Renders ContentRuleDrawer in isolation with a minimal
// mocked auth context, the same way ContentRuleDrawer.test.tsx does, but in a
// real browser so the real Tailwind/shadcn styling and real zh.json copy are
// captured. Safe to delete once the screenshots are regenerated — it does not
// require a live backend (testContentRule is intercepted at the network layer
// by the capture script) and is not linked from anywhere in the app.

import { AuthContext } from '@/contexts/auth-context';
import { ContentRuleDrawer } from '@/components/security/content-rules/ContentRuleDrawer';

const MOCK_AUTH = {
  user: {
    id: 1,
    username: 'pw-tenant-admin',
    role: 'tenant_admin',
    tenant_id: 1,
    created_at: '',
    updated_at: '',
  },
  token: 'dev-screenshot-token',
  expiresAt: null,
  selectedTenantId: null,
  isLoading: false,
  demoAuthBypassEnabled: false,
  showAdvancedRules: true,
  features: { aiInterpret: false },
  login: async () => {},
  completeLogin: () => {},
  logout: async () => {},
  startDemoSession: () => {},
  setSelectedTenant: () => {},
  hasPermission: () => true,
  isSystemAdmin: false,
  isTenantAdmin: true,
  isTrueSuperAdmin: false,
  canSeeRoute: () => true,
  can: () => true,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
} as any;

export default function DevScreenshotGT12826Page() {
  return (
    <AuthContext.Provider value={MOCK_AUTH}>
      <div className="min-h-screen bg-muted/30 p-8">
        <ContentRuleDrawer
          open
          onOpenChange={() => {}}
          editingRule={null}
          contentGroups={[]}
          onSubmit={async () => {}}
        />
      </div>
    </AuthContext.Provider>
  );
}
