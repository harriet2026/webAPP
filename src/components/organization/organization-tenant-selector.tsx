'use client';

import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useAuth } from '@/contexts/auth-context';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { apiRequest } from '@/lib/api/client';

interface Tenant {
  id: number;
  name: string;
}

async function fetchTenants(): Promise<Tenant[]> {
  const res = await apiRequest<{ items: Tenant[] }>('/tenants');
  return res.items ?? [];
}

// System-admin-only tenant picker scoped to the organization-contacts page.
// Organization contacts are inherently per-tenant, so unlike the removed global
// header selector this one has NO "all tenants" option — a concrete tenant must
// always be chosen (selectedTenantId === null renders the page's "select a
// tenant" empty state). Picking a tenant calls setSelectedTenant, which the
// page's child tabs already read via useAuth/useApiRequest (X-Tenant-ID header).
export function OrganizationTenantSelector() {
  const { isSystemAdmin, selectedTenantId, setSelectedTenant } = useAuth();
  const t = useTranslations();

  const { data: tenants } = useQuery({
    queryKey: ['tenants'],
    queryFn: fetchTenants,
    enabled: isSystemAdmin,
  });

  // Without `items`, Base UI's <Select.Value> falls back to the raw value and the
  // trigger shows the tenant id instead of its name (GT-12021).
  const selectItems = useMemo(
    () => Object.fromEntries((tenants ?? []).map((tenant) => [tenant.id.toString(), tenant.name])),
    [tenants],
  );

  if (!isSystemAdmin) {
    return null;
  }

  return (
    <Select
      items={selectItems}
      value={selectedTenantId?.toString() ?? ''}
      onValueChange={(value) => {
        if (value === null) return;
        const numValue = parseInt(value, 10);
        if (!isNaN(numValue)) {
          setSelectedTenant(numValue);
        }
      }}
    >
      <SelectTrigger className="w-[180px]">
        <SelectValue placeholder={t('organizationContacts.selectTenantPlaceholder')} />
      </SelectTrigger>
      <SelectContent>
        {tenants?.map((tenant) => (
          <SelectItem key={tenant.id} value={tenant.id.toString()}>
            {tenant.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
