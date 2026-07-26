'use client';

import { Info, ShieldCheck } from 'lucide-react';
import { useTranslations } from 'next-intl';

import {
  PageHeader,
  PageShell,
  PageSurface,
} from '@/components/shared/page-shell';
import { AccessDeniedPanel } from '@/components/shared/state-panel';
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/components/ui/tabs';
import { BasicLimitTab } from '@/components/security/attachment-security/BasicLimitTab';
import { GroupManagementPage } from '@/components/security/groups/group-management-page';
import { ConnectionLayerPanel } from './ConnectionLayerPanel';
import { usePermission } from '@/hooks/use-permission';

/**
 * 平台安全策略页（GT-11874）
 *
 * - 入口对齐 demo `design/origin/demo/app/admin/platform-security`：
 *   - "IP 策略" tab：复用 `ConnectionLayerPanel`，渲染 demo 同款
 *     "左侧 4 模块导航卡 + 右侧选中模块配置"布局（IP频率/IP黑白名单/RBL/海外邮件检测）
 *   - "附件基础限制" tab：复用 `attachment-security/BasicLimitTab`
 * - 仅 system_admin（permission = manage_tenants）可见 / 可修改，
 *   tenant_admin 登录后会经侧栏权限门控隐藏。
 *
 * 不修改 layout / globals / 共享组件，只新增本组件 + 新路由 + sidebar 项 + i18n。
 */
export function PlatformSecurityPage() {
  const t = useTranslations('platformSecurity');
  const { canManageTenants } = usePermission();

  if (!canManageTenants) {
    return (
      <PageShell>
        <PageHeader title={t('title')} />
        <AccessDeniedPanel description={t('accessDenied')} />
      </PageShell>
    );
  }

  return (
    <PageShell>
      <PageHeader
        title={
          <span className="flex items-center gap-2">
            <ShieldCheck className="h-6 w-6 text-primary" />
            {t('title')}
          </span>
        }
        description={t('subtitle')}
      />
      <PageSurface>
        <Tabs defaultValue="ip" className="w-full space-y-4">
          <TabsList>
            <TabsTrigger value="ip">{t('tabs.ipStrategy')}</TabsTrigger>
            {/* 群组策略：平台级 IP 组管理，供 IP 黑白名单表达式引用（spec
                2026-07-21-platform-ip-group-policy-tab-design） */}
            <TabsTrigger value="groups" data-testid="platform-security-tab-groups">
              {t('tabs.groupPolicy')}
            </TabsTrigger>
            <TabsTrigger value="attachment">
              {t('tabs.attachmentLimit')}
            </TabsTrigger>
          </TabsList>

          <TabsContent value="ip" className="mt-0">
            <ConnectionLayerPanel />
          </TabsContent>

          <TabsContent value="groups" className="mt-0">
            <GroupManagementPage platformScope />
          </TabsContent>

          <TabsContent value="attachment" className="mt-0 space-y-4">
            <div className="flex items-start gap-2 rounded-md border border-info/20 bg-info/10 px-4 py-3 text-sm text-info">
              <Info className="mt-0.5 h-4 w-4 shrink-0" />
              <span className="text-pretty">{t('attachmentHint')}</span>
            </div>
            <BasicLimitTab />
          </TabsContent>
        </Tabs>
      </PageSurface>
    </PageShell>
  );
}