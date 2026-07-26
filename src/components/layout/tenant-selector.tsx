'use client';

import { useEffect, useMemo, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/contexts/auth-context';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { listTenants, getTenant } from '@/lib/api/tenants';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

interface TenantSelectorProps {
  /**
   * Page-local tenant scope. When supplied with onChange, the selector does
   * not alter the global impersonation context used by security-module pages.
   */
  value?: number | null;
  onChange?: (tenantId: number | null) => void;
  className?: string;
}

export function TenantSelector({ value, onChange, className }: TenantSelectorProps = {}) {
  const { isSystemAdmin, selectedTenantId, setSelectedTenant } = useAuth();
  const t = useTranslations('header');
  const isPageScoped = onChange !== undefined;
  const currentTenantId = isPageScoped ? value ?? null : selectedTenantId;

  const { data: tenants } = useQuery({
    queryKey: ['tenants', 'active'],
    queryFn: () => listTenants({ status: 'active', pageSize: 100 }).then((r) => r.items ?? []),
    enabled: isSystemAdmin,
  });

  // When the selected tenant is not found in the first-page list, verify it still
  // exists and is active before clearing. This prevents false positives when there
  // are more than 100 active tenants and the selected one falls outside the page.
  const selectedNotInList = useMemo(
    () =>
      tenants != null &&
      currentTenantId != null &&
      !tenants.some((t) => t.id === currentTenantId),
    [tenants, currentTenantId],
  );

  const { data: verifiedTenant, isLoading: verifying } = useQuery({
    queryKey: ['tenant', currentTenantId, 'verify'],
    queryFn: () => getTenant(currentTenantId!),
    enabled: selectedNotInList,
    retry: false,
  });

  useEffect(() => {
    if (!selectedNotInList || verifying) return;
    // verifiedTenant is undefined while loading; null/error means not found
    if (!verifiedTenant || verifiedTenant.status !== 'active') {
      if (isPageScoped) {
        onChange(null);
      } else {
        setSelectedTenant(null);
      }
      toast.warning(t('tenantUnavailable'));
    }
  }, [selectedNotInList, verifying, verifiedTenant, isPageScoped, onChange, setSelectedTenant, t]);

  // Base UI's <Select.Value> renders the raw value unless the Root is handed an
  // `items` map, which is what made the trigger show the tenant id (GT-12021).
  // `tenants` is only the first page (page_size is hard-clamped to 100 server
  // side), and the effect above deliberately KEEPS a selection that falls
  // outside it as long as verifiedTenant says it is still active — so fold that
  // tenant in too, or the trigger would render its raw id on exactly the path
  // this component special-cases.
  const selectItems = useMemo(() => {
    const map: Record<string, ReactNode> = { all: t('allTenants') };
    for (const tenant of tenants ?? []) {
      map[tenant.id.toString()] = tenant.name;
    }
    if (verifiedTenant?.id != null) {
      map[verifiedTenant.id.toString()] = verifiedTenant.name;
    }
    return map;
  }, [tenants, verifiedTenant, t]);

  if (!isSystemAdmin) {
    return null;
  }

  const handleValueChange = (value: string | null) => {
    const tenantId = !value || value === 'all' ? null : Number(value);
    if (tenantId !== null && !Number.isInteger(tenantId)) return;
    if (isPageScoped) {
      onChange(tenantId);
    } else {
      setSelectedTenant(tenantId);
    }
  };

  return (
    <Select
      items={selectItems}
      value={currentTenantId?.toString() ?? 'all'}
      onValueChange={handleValueChange}
    >
      <SelectTrigger size="sm" className={cn('w-[160px]', className)} data-testid="tenant-selector">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="all">{t('allTenants')}</SelectItem>
        {tenants?.map((tenant) => (
          <SelectItem key={tenant.id} value={tenant.id.toString()}>
            {tenant.name}
          </SelectItem>
        ))}
        {/* The kept-but-off-page selection (see selectItems) needs an option of
            its own, otherwise the current value has no row in the popup. */}
        {selectedNotInList && verifiedTenant?.id != null && (
          <SelectItem key={verifiedTenant.id} value={verifiedTenant.id.toString()}>
            {verifiedTenant.name}
          </SelectItem>
        )}
      </SelectContent>
    </Select>
  );
}
