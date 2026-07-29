'use client';

import { useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Plus, Settings } from 'lucide-react';

import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { PageHeader, PageShell } from '@/components/shared/page-shell';
import { AccessDeniedPanel } from '@/components/shared/state-panel';
import { usePermission } from '@/hooks/use-permission';
import { useProductForm } from '@/contexts/product-form-context';
import type { Tenant } from '@/types/tenant';

import { TenantStatsCards } from '@/components/tenants/tenant-stats-cards';
import { TenantList } from '@/components/tenants/tenant-list';
import { TenantFormDrawer } from '@/components/tenants/tenant-form-drawer';
import { RoutingTab } from '@/components/tenants/routing/routing-tab';

export default function TenantsPage() {
  const t = useTranslations('tenants');
  const { canManageTenants } = usePermission();
  const { capabilities } = useProductForm();

  // GT-12437：认证日志详情「命中配置」深链 ?view=routing 直达「域名与路由」
  // 页签（顶层 Tabs 的参数名刻意与 MailRoutingShell 的 ?tab= 区分开）。
  const initialView = useSearchParams().get('view') === 'routing' ? 'routing' : 'manage';
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editingTenant, setEditingTenant] = useState<Tenant | null>(null);

  // Backend 404 backstop: when the product form does not enable multi-tenancy,
  // the /tenants endpoints are not mounted. Guard on the capability and render
  // the not-found panel so a platform admin never sees a broken page.
  if (capabilities && !capabilities.multiTenant) {
    return <AccessDeniedPanel description={t('title')} />;
  }

  if (!canManageTenants) {
    return <AccessDeniedPanel description={t('title')} />;
  }

  const openCreate = () => {
    setEditingTenant(null);
    setDrawerOpen(true);
  };

  const openEdit = (tenant: Tenant) => {
    setEditingTenant(tenant);
    setDrawerOpen(true);
  };

  return (
    <PageShell>
      <PageHeader
        eyebrow={t('eyebrow')}
        title={t('title')}
        actions={
          <Button onClick={openCreate}>
            <Plus className="mr-2 h-4 w-4" />
            {t('createTenant')}
          </Button>
        }
      />

      <Tabs defaultValue={initialView}>
        <TabsList>
          <TabsTrigger value="manage">{t('title')}</TabsTrigger>
          <TabsTrigger value="routing">
            <Settings className="h-4 w-4" />
            {t('domainManagement')}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="manage" className="mt-6 space-y-6">
          <TenantStatsCards />
          <TenantList onEdit={openEdit} />
        </TabsContent>

        <TabsContent value="routing" className="mt-6">
          <RoutingTab />
        </TabsContent>
      </Tabs>

      <TenantFormDrawer
        open={drawerOpen}
        onOpenChange={setDrawerOpen}
        editingTenant={editingTenant}
      />
    </PageShell>
  );
}

export { TenantsPage };
