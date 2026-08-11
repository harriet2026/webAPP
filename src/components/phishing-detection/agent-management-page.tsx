'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { AlertTriangle, ChevronLeft, ChevronRight } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Switch } from '@/components/ui/switch';
import { ConfirmDialog } from '@/components/shared/confirm-dialog';
import { useApiRequest } from '@/lib/api/client';
import { useApiErrorMessage } from '@/lib/api/use-api-error-message';
import { getEngineConfig, putEngineConfig, listAdmissionRules } from '@/lib/api/phishing-config';
import type { PhishTenantEngineParams } from '@/types/phishing-config';
import { PhishingOverviewPage } from './phishing-overview-page';
import { PhishingConfigPage } from './config/phishing-config-page';

type AgentKey = 'phishing';

interface AgentNavItem {
  key: AgentKey;
  label: string;
  icon: React.ReactNode;
}

export type PhishingAgentTab = 'overview' | 'config';

// 智能体总开关（GT-12865）：整体启用/禁用钓鱼邮件检测智能体，与「检测引擎配置」
// tab 内的 run_mode（实时检测/观察模式）是两个独立维度——run_mode 只在总开关
// 开启时才有意义。数据源复用已有的 /phishing-agent/engine-config 接口，
// query key 与 disposition-policy-card.tsx / admission-rules-section.tsx 保持
// 一致（'phish-engine-config' / 'phish-admission-rules'），避免重复请求。
function usePhishingEngineToggle() {
  const t = useTranslations('phishingDetection');
  const apiErrorMessage = useApiErrorMessage();
  const { apiRequest } = useApiRequest();
  const queryClient = useQueryClient();

  const engineQuery = useQuery({
    queryKey: ['phish-engine-config'],
    queryFn: () => getEngineConfig(apiRequest),
  });
  const admissionQuery = useQuery({
    queryKey: ['phish-admission-rules'],
    queryFn: () => listAdmissionRules(apiRequest),
  });

  const enabled = engineQuery.data?.engine.enabled ?? true;
  // 开启前置条件：检测范围与准入规则里至少存在一条已启用的规则；准入规则列表
  // 仍在加载时禁用总开关，避免在校验结果未知前放行开启（fail-closed）。
  const admissionCheckPending = admissionQuery.isLoading;
  const hasActiveAdmissionRule = (admissionQuery.data ?? []).some((rule) => rule.enabled);

  const toggleMutation = useMutation({
    mutationFn: (next: boolean) => {
      const current = engineQuery.data?.engine as PhishTenantEngineParams;
      return putEngineConfig({ ...current, enabled: next }, apiRequest);
    },
    onSuccess: (_result, next) => {
      queryClient.invalidateQueries({ queryKey: ['phish-engine-config'] });
      toast.success(next ? t('toggle.enabledToast') : t('toggle.disabledToast'));
    },
    onError: (err) => toast.error(apiErrorMessage(err, t('toggle.saveFailed'))),
  });

  return {
    enabled,
    isLoading: engineQuery.isLoading,
    isPending: toggleMutation.isPending,
    admissionCheckPending,
    hasActiveAdmissionRule,
    toggle: (next: boolean) => toggleMutation.mutate(next),
  };
}

export function PhishingAgentHeaderActions({ className }: { className?: string }) {
  const t = useTranslations('phishingDetection');
  const tc = useTranslations('common');
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const {
    enabled,
    isLoading,
    isPending,
    admissionCheckPending,
    hasActiveAdmissionRule,
    toggle,
  } = usePhishingEngineToggle();
  const [disableConfirmOpen, setDisableConfirmOpen] = useState(false);
  const [admissionGateOpen, setAdmissionGateOpen] = useState(false);

  function goToAdmissionRules() {
    const next = new URLSearchParams(searchParams.toString());
    next.set('agent', 'phishing');
    next.set('tab', 'config');
    router.replace(`${pathname}?${next.toString()}`, { scroll: false });
  }

  function handleCheckedChange(next: boolean) {
    if (!next) {
      setDisableConfirmOpen(true);
      return;
    }
    if (!hasActiveAdmissionRule) {
      setAdmissionGateOpen(true);
      return;
    }
    toggle(true);
  }

  return (
    <div className={cn('flex items-center gap-2', className)}>
      <span className={cn('text-sm', enabled ? 'text-primary' : 'text-muted-foreground')}>
        {enabled ? tc('enabled') : tc('disabled')}
      </span>
      <Switch
        checked={enabled}
        disabled={isLoading || isPending || admissionCheckPending}
        onCheckedChange={handleCheckedChange}
        data-testid="phishing-agent-master-switch"
      />
      <ConfirmDialog
        open={disableConfirmOpen}
        onOpenChange={setDisableConfirmOpen}
        title={t('toggle.disableConfirmTitle')}
        description={t('toggle.disableConfirmDescription')}
        confirmText={t('toggle.disableConfirmAction')}
        variant="destructive"
        onConfirm={() => toggle(false)}
      />
      <ConfirmDialog
        open={admissionGateOpen}
        onOpenChange={setAdmissionGateOpen}
        title={t('toggle.admissionGateTitle')}
        description={t('toggle.admissionGateDescription')}
        confirmText={t('toggle.admissionGateAction')}
        onConfirm={goToAdmissionRules}
      />
    </div>
  );
}

export function PhishingAgentPanel({
  initialTab = 'overview',
  configurationEnabled = true,
}: {
  initialTab?: PhishingAgentTab;
  configurationEnabled?: boolean;
}) {
  const t = useTranslations('phishingDetection');
  const activeTab = configurationEnabled ? initialTab : 'overview';
  const { enabled: agentEnabled } = usePhishingEngineToggle();
  return (
    <div className="flex h-full flex-col">
      {!agentEnabled ? (
        <div
          className="mb-4 shrink-0 rounded-lg border border-orange-200 bg-orange-50 px-4 py-3 text-sm text-orange-700 dark:border-orange-800 dark:bg-orange-950/30 dark:text-orange-400"
          data-testid="phishing-agent-disabled-banner"
        >
          {t('toggle.disabledBanner')}
        </div>
      ) : null}
      <Tabs key={activeTab} defaultValue={activeTab} className="flex min-h-0 flex-1 flex-col">
        <TabsList className="mb-4 shrink-0 self-start rounded-lg border-border bg-muted/30 shadow-none">
          <TabsTrigger value="overview" className="min-h-8 rounded-md px-3">{t('tabs.overview')}</TabsTrigger>
          {configurationEnabled ? (
            <TabsTrigger value="config" className="min-h-8 rounded-md px-3" data-testid="phishing-config-tab">
              {t('tabs.config')}
            </TabsTrigger>
          ) : null}
        </TabsList>
        <TabsContent value="overview" className="flex-1 overflow-auto mt-0">
          <PhishingOverviewPage />
        </TabsContent>
        {configurationEnabled ? (
          <TabsContent value="config" className="flex-1 overflow-auto mt-0">
            <PhishingConfigPage />
          </TabsContent>
        ) : null}
      </Tabs>
    </div>
  );
}

export function AgentManagementPage() {
  const t = useTranslations('phishingDetection');
  const tSidebar = useTranslations('sidebar');
  const [selected, setSelected] = useState<AgentKey>('phishing');
  const [navCollapsed, setNavCollapsed] = useState(false);

  const agents: AgentNavItem[] = [
    {
      key: 'phishing',
      label: t('navPhishingAgent'),
      icon: <AlertTriangle className="h-4 w-4" />,
    },
  ];

  const selectedLabel = agents.find((a) => a.key === selected)?.label ?? '';

  return (
    <TooltipProvider>
      <div className="flex h-full flex-col gap-3">
        {/* Breadcrumb */}
        <div className="flex items-center gap-1.5 text-sm">
          <span className="font-medium text-foreground">{tSidebar('agentManagement')}</span>
          <span className="text-muted-foreground">/</span>
          <span className="text-muted-foreground">{selectedLabel}</span>
        </div>

        {/* Body: left nav + right panel */}
        <div className="relative flex min-h-0 flex-1 overflow-hidden rounded-[18px] border border-border/70 shadow-[0_8px_24px_rgba(15,23,42,0.06)]">
          {/* Collapse toggle */}
          <button
            onClick={() => setNavCollapsed((v) => !v)}
            className={cn(
              'absolute top-1/2 z-30 -translate-y-1/2 flex h-6 w-6 items-center justify-center rounded-full border bg-background shadow-md transition-[left] duration-200 hover:bg-accent',
              navCollapsed ? 'left-[calc(56px-12px)]' : 'left-[calc(200px-12px)]',
            )}
            aria-label={navCollapsed ? t('expandMenu') : t('collapseMenu')}
          >
            {navCollapsed ? (
              <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
            ) : (
              <ChevronLeft className="h-3.5 w-3.5 text-muted-foreground" />
            )}
          </button>

          {/* Left nav */}
          <nav
            className={cn(
              'flex flex-col border-r bg-muted/20 transition-[width] duration-200 overflow-hidden',
              navCollapsed ? 'w-14' : 'w-[200px]',
            )}
          >
            <ul className="flex-1 space-y-0.5 p-2 pt-4">
              {agents.map((agent) => {
                const btn = (
                  <button
                    key={agent.key}
                    onClick={() => setSelected(agent.key)}
                    className={cn(
                      'flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-sm transition-colors',
                      navCollapsed ? 'justify-center' : '',
                      selected === agent.key
                        ? 'bg-primary/10 font-medium text-primary'
                        : 'text-muted-foreground hover:bg-accent hover:text-foreground',
                    )}
                  >
                    <span className="shrink-0">{agent.icon}</span>
                    {!navCollapsed && (
                      <span className="truncate">{agent.label}</span>
                    )}
                  </button>
                );
                if (!navCollapsed) return <li key={agent.key}>{btn}</li>;
                return (
                  <li key={agent.key}>
                    <Tooltip>
                      <TooltipTrigger render={btn} />
                      <TooltipContent side="right">{agent.label}</TooltipContent>
                    </Tooltip>
                  </li>
                );
              })}
            </ul>
          </nav>

          {/* Right content */}
          <div className="flex-1 overflow-y-auto bg-background p-6">
            {selected === 'phishing' && <PhishingAgentPanel />}
          </div>
        </div>
      </div>
    </TooltipProvider>
  );
}
