'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { ArrowRight, Info, ListChecks } from 'lucide-react';
import { toast } from 'sonner';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { useApiRequest } from '@/lib/api/client';
import { getSpoofEngineConfig, putSpoofEngineConfig } from '@/lib/api/spoofing-detection';
import type { SpoofEngineParams } from '@/types/spoofing-detection';
import { useSpoofingAccess } from './spoofing-access';
import { SpoofingOverviewPage } from './spoofing-overview-page';
import { SpoofingPersonsPage } from './spoofing-persons-page';
import { SpoofingBrandsPage } from './spoofing-brands-page';
import { SpoofingWhitelistPanel } from './spoofing-whitelist-panel';
import { cn } from '@/lib/utils';
import { spoofingQueryKeys } from './spoofing-query-keys';
import { useApiErrorMessage } from '@/lib/api/use-api-error-message';

export type SpoofingAgentTab = 'overview' | 'protected-objects' | 'brand';

interface SpoofingAgentPageProps {
  initialTab?: SpoofingAgentTab;
  embedded?: boolean;
  configurationEnabled?: boolean;
}

function useSpoofingEngineToggle() {
  const t = useTranslations('spoofingDetection');
  const apiErrorMessage = useApiErrorMessage();
  const { apiRequest, effectiveTenantId } = useApiRequest();
  const { canEdit } = useSpoofingAccess();
  const qc = useQueryClient();

  const engineQuery = useQuery({
    queryKey: spoofingQueryKeys.engine(effectiveTenantId),
    queryFn: () => getSpoofEngineConfig(apiRequest),
  });
  const enabled = engineQuery.data?.enabled ?? true;

  const toggleMutation = useMutation({
    mutationFn: (next: boolean) => {
      const cur = engineQuery.data as SpoofEngineParams;
      return putSpoofEngineConfig({ ...cur, enabled: next }, apiRequest);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: spoofingQueryKeys.engine(effectiveTenantId) });
      toast.success(t('enableSwitch'));
    },
    onError: (e) => toast.error(apiErrorMessage(e, 'error')),
  });

  return {
    canEdit,
    enabled,
    isLoading: engineQuery.isLoading,
    isPending: toggleMutation.isPending,
    toggle: (next: boolean) => toggleMutation.mutate(next),
  };
}

export function SpoofingAgentHeaderControls({ className }: { className?: string }) {
  const tc = useTranslations('common');
  const { canEdit, enabled, isLoading, isPending, toggle } = useSpoofingEngineToggle();

  return (
    <div className={cn('flex items-center gap-2', className)}>
      <span className={cn('text-sm', enabled ? 'text-primary' : 'text-muted-foreground')}>
        {enabled ? tc('enabled') : tc('disabled')}
      </span>
      <Switch
        checked={enabled}
        disabled={!canEdit || isLoading || isPending}
        onCheckedChange={toggle}
      />
    </div>
  );
}

export function SpoofingAgentHeaderActions({ className }: { className?: string }) {
  const t = useTranslations('spoofingDetection');
  const { effectiveTenantId } = useApiRequest();
  const { enabled } = useSpoofingEngineToggle();

  return (
    <div className={cn('flex items-center gap-3', className)}>
      <Popover>
        <PopoverTrigger render={<Button variant="outline" size="sm" />}>
          <ListChecks className="mr-1.5 h-4 w-4" />
          {t('whitelistEntry')}
        </PopoverTrigger>
        <PopoverContent align="end" className="w-[420px] p-0">
          <SpoofingWhitelistPanel key={effectiveTenantId ?? 'platform'} auditOnly={!enabled} />
        </PopoverContent>
      </Popover>
      <SpoofingAgentHeaderControls />
    </div>
  );
}

export function SpoofingAgentPage({
  initialTab = 'overview',
  embedded = false,
  configurationEnabled = true,
}: SpoofingAgentPageProps) {
  const t = useTranslations('spoofingDetection');
  const tSidebar = useTranslations('sidebar');
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { enabled } = useSpoofingEngineToggle();
  const activeTab = configurationEnabled ? initialTab : 'overview';

  function changeTab(value: string) {
    if (!configurationEnabled) return;
    const next = new URLSearchParams(searchParams.toString());
    next.set('agent', 'spoofing');
    next.set('tab', value);
    router.replace(`${pathname}?${next.toString()}`, { scroll: false });
  }

  return (
    <div className="flex h-full flex-col gap-4">
      <div className="rounded-lg border border-border bg-muted/40 px-4 py-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2 text-sm text-muted-foreground">
            <span className="shrink-0">{tSidebar('agentCenter')}</span>
            <ArrowRight className="h-3.5 w-3.5 shrink-0" />
            <span className="shrink-0">{t('eyebrow')}</span>
            <ArrowRight className="h-3.5 w-3.5 shrink-0" />
            <span className="truncate font-medium text-foreground">
              {embedded ? t('title') : t('navSpoofingAgent')}
            </span>
          </div>
          {!embedded ? <SpoofingAgentHeaderActions /> : null}
        </div>
      </div>

      {/* Audit-only banner */}
      {!enabled ? (
        <div className="flex items-start gap-2 rounded-lg border border-amber-300/60 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-300">
          <Info className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{t('auditOnlyBanner')}</span>
        </div>
      ) : null}

      {/* Tabs */}
      <Tabs key={activeTab} defaultValue={activeTab} onValueChange={changeTab} className="flex min-h-0 flex-1 flex-col">
        <TabsList className="h-10 shrink-0 self-start rounded-lg p-1">
          <TabsTrigger value="overview" className="px-4 text-sm">{t('tabs.overview')}</TabsTrigger>
          {configurationEnabled ? (
            <>
              <TabsTrigger value="protected-objects" className="px-4 text-sm" data-testid="spoofing-protected-objects-tab">
                {t('tabs.displayname')}
              </TabsTrigger>
              <TabsTrigger value="brand" className="px-4 text-sm" data-testid="spoofing-brand-tab">
                {t('tabs.brand')}
              </TabsTrigger>
            </>
          ) : null}
        </TabsList>
        <TabsContent value="overview" className="mt-5 flex-1 overflow-auto">
          <SpoofingOverviewPage />
        </TabsContent>
        {configurationEnabled ? (
          <>
            <TabsContent value="protected-objects" className="mt-5 flex-1 overflow-auto">
              <SpoofingPersonsPage auditOnly={!enabled} />
            </TabsContent>
            <TabsContent value="brand" className="mt-5 flex-1 overflow-auto">
              <SpoofingBrandsPage auditOnly={!enabled} />
            </TabsContent>
          </>
        ) : null}
      </Tabs>
    </div>
  );
}
