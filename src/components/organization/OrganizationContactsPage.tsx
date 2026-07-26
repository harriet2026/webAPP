'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { PageHeader, PageShell } from '@/components/shared/page-shell';
import { useAuth } from '@/contexts/auth-context';
import { DataSourceTab } from './DataSourceTab';
import { ContactQueryTab } from './ContactQueryTab';
import { SyncLogTab } from './SyncLogTab';
import { OrganizationTenantSelector } from './organization-tenant-selector';

// demo contacts-page.tsx：灰底圆角 Tab 容器 + 白底激活块，无图标；
// 「新增数据源」在数据源 Tab 工具栏内（不在页头）。
const TAB_TRIGGER_CLS =
  'rounded-md px-4 py-1.5 text-sm font-medium text-gray-500 data-active:bg-white data-active:text-gray-900 data-active:shadow-sm dark:data-active:bg-gray-950 dark:data-active:text-gray-100';

export function OrganizationContactsPage() {
  const t = useTranslations('organizationContacts');
  const { isSystemAdmin, selectedTenantId } = useAuth();
  const [activeTab, setActiveTab] = useState('sources');

  return (
    <PageShell data-testid="contacts-page">
      <PageHeader
        eyebrow={t('eyebrow')}
        title={t('title')}
        description={t('subtitle')}
        actions={isSystemAdmin ? <OrganizationTenantSelector /> : null}
      />
      {isSystemAdmin && selectedTenantId === null ? (
        <div className="flex flex-col items-center justify-center gap-2 py-24 text-center">
          <p className="text-base font-medium">{t('selectTenantTitle')}</p>
          <p className="text-sm text-muted-foreground">{t('selectTenantDesc')}</p>
        </div>
      ) : (
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="h-auto gap-1 rounded-lg border-0 bg-gray-200/60 p-1 dark:bg-gray-800/60">
            <TabsTrigger value="sources" className={TAB_TRIGGER_CLS} data-testid="contacts-tab-source">
              {t('tabSources')}
            </TabsTrigger>
            <TabsTrigger value="contacts" className={TAB_TRIGGER_CLS} data-testid="contacts-tab-book">
              {t('tabContacts')}
            </TabsTrigger>
            <TabsTrigger value="logs" className={TAB_TRIGGER_CLS} data-testid="contacts-tab-log">
              {t('tabLogs')}
            </TabsTrigger>
          </TabsList>
          {/*
            GT-12339: keepMounted 让三个页签的面板在切换时保留在 DOM 中(仅隐藏
            非活动页签),从而各自的搜索/筛选/分页 useState 不会因卸载而丢失——
            管理员在页签间来回核对数据时无需反复重输查询条件(spec §Tab切换)。
          */}
          <TabsContent value="sources" keepMounted>
            <DataSourceTab />
          </TabsContent>
          <TabsContent value="contacts" keepMounted>
            <ContactQueryTab />
          </TabsContent>
          <TabsContent value="logs" keepMounted>
            <SyncLogTab />
          </TabsContent>
        </Tabs>
      )}
    </PageShell>
  );
}
