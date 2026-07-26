'use client';

import { useQuery } from '@tanstack/react-query';
import { ArrowLeftCircle } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { Button } from '@/components/ui/button';
import { useAuth } from '@/contexts/auth-context';
import { useProductForm } from '@/contexts/product-form-context';
import { apiRequest } from '@/lib/api/client';

interface TenantListItem {
  id: number;
  name: string;
}

async function fetchTenantNames(): Promise<TenantListItem[]> {
  const res = await apiRequest<{ items: TenantListItem[] }>('/tenants');
  return res.items ?? [];
}

// ImpersonationBanner is shown only when a platform (system) administrator has
// entered a tenant view via the "管理" (impersonate) action (Spec 1 §8.2). It
// makes the impersonation state salient and provides a one-click exit back to
// the platform view — without it the only escape is a full logout, since
// clearing selectedTenant alone does not reset the viewer.
export function ImpersonationBanner() {
  const t = useTranslations();
  const { isSystemAdmin, selectedTenantId, setSelectedTenant } = useAuth();
  const { viewer, setViewer } = useProductForm();

  // Reuse the shared ['tenants'] query key to look up the impersonated tenant's name.
  const { data: tenants } = useQuery({
    queryKey: ['tenants'],
    queryFn: fetchTenantNames,
    enabled: isSystemAdmin && viewer === 'tenant',
  });

  // Only a system_admin who has switched to the tenant viewer is impersonating.
  // A real tenant_admin is clamped to 'tenant' regardless and must not see this.
  if (!isSystemAdmin || viewer !== 'tenant') {
    return null;
  }

  const tenantName =
    tenants?.find((x) => x.id === selectedTenantId)?.name ??
    (selectedTenantId != null ? `#${selectedTenantId}` : '');

  const exitImpersonation = () => {
    // Order matters: clear the selected tenant (cookie + localStorage + state)
    // first so the subsequent bootstrap fetch (driven by cookie change) drops
    // X-Tenant-ID, then flip the viewer back to platform.
    setSelectedTenant(null);
    setViewer('platform');
  };

  return (
    <div className="flex items-center gap-3 border-b border-amber-500/40 bg-amber-500/10 px-4 py-2 text-sm sm:px-6 lg:px-8">
      <span className="font-medium text-amber-700 dark:text-amber-300">
        {t('header.impersonating', { name: tenantName })}
      </span>
      <Button
        variant="outline"
        size="sm"
        className="ml-auto gap-1.5 border-amber-500/50 text-amber-700 hover:bg-amber-500/15 dark:text-amber-300"
        onClick={exitImpersonation}
      >
        <ArrowLeftCircle className="h-4 w-4" />
        {t('header.exitImpersonation')}
      </Button>
    </div>
  );
}
