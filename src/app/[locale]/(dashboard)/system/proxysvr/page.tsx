'use client';

import { useTranslations } from 'next-intl';
import { PageHeader, PageShell, PageSurface } from '@/components/shared/page-shell';
import { AccessDeniedPanel } from '@/components/shared/state-panel';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { usePermission } from '@/hooks/use-permission';
import { ProxysvrEndpointsSection } from '@/components/proxysvr/proxysvr-endpoints-section';
import { ProxysvrGroupsSection } from '@/components/proxysvr/proxysvr-groups-section';

export default function ProxysvrManagementPage() {
  const t = useTranslations();
  const { isSystemAdmin } = usePermission();

  if (!isSystemAdmin) {
    return <AccessDeniedPanel description={t('common.accessDenied')} />;
  }

  return (
    <PageShell>
      <PageHeader
        eyebrow={t('proxysvr.eyebrow')}
        title={t('proxysvr.title')}
        description={t('proxysvr.pageDescription')}
      />
      <PageSurface>
        <Tabs defaultValue="endpoints" className="space-y-4">
          <TabsList>
            <TabsTrigger value="endpoints" data-testid="proxysvr-tab-endpoints">
              {t('proxysvr.endpointsTab')}
            </TabsTrigger>
            <TabsTrigger value="groups" data-testid="proxysvr-tab-groups">
              {t('proxysvr.groupsTab')}
            </TabsTrigger>
          </TabsList>
          <TabsContent value="endpoints">
            <ProxysvrEndpointsSection />
          </TabsContent>
          <TabsContent value="groups">
            <ProxysvrGroupsSection />
          </TabsContent>
        </Tabs>
      </PageSurface>
    </PageShell>
  );
}
