'use client';

import { useContext, useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { useMutation, useQuery, useQueryClient, QueryClientContext } from '@tanstack/react-query';
import { ChevronDown, Loader2, ShieldCheck } from 'lucide-react';
import { toast } from 'sonner';

import { Collapsible, CollapsibleContent } from '@/components/ui/collapsible';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { AuthContext } from '@/contexts/auth-context';
import { useProductForm } from '@/contexts/product-form-context';
import { usePermission } from '@/hooks/use-permission';
import { useTenant } from '@/hooks/use-tenant';
import { getARCSettings, putARCSettings, type ARCSettings } from '@/lib/api/arc';
import { useApiRequest } from '@/lib/api/client';
import { listAllDkimKeys } from '@/lib/api/dkim';
import { useApiErrorMessage } from '@/lib/api/use-api-error-message';
import { cn } from '@/lib/utils';

// ARC is a tenant-wide authentication finalizer. It intentionally lives beside
// DKIM key management rather than inside any one mutation feature's form.
export function ARCSealingSection() {
  const hasQueryClient = useContext(QueryClientContext) != null;
  const hasAuth = useContext(AuthContext) != null;
  if (!hasQueryClient || !hasAuth) return null;
  return <ARCSealingSectionInner />;
}

function ARCSealingSectionInner() {
  const t = useTranslations('authSpoofing.arcSealing');
  const queryClient = useQueryClient();
  const { apiRequest } = useApiRequest();
  const apiErrorMessage = useApiErrorMessage();
  const { effectiveTenantId, isSystemAdmin } = useTenant();
  const { isTenantAdmin } = usePermission();
  const { capabilities } = useProductForm();
  const [open, setOpen] = useState(true);

  const platformWithoutTenant =
    !!capabilities?.multiTenant && isSystemAdmin && effectiveTenantId == null;
  const canQuery =
    (isSystemAdmin || isTenantAdmin) && effectiveTenantId != null && !platformWithoutTenant;
  const queryKey = ['arc-settings', effectiveTenantId];

  const { data: settings, isLoading: settingsLoading } = useQuery({
    queryKey,
    queryFn: () => getARCSettings(apiRequest),
    enabled: canQuery,
  });
  const { data: keys, isLoading: keysLoading } = useQuery({
    queryKey: ['dkim-keys', 'arc-eligible', effectiveTenantId],
    queryFn: () => listAllDkimKeys({ tenant_id: effectiveTenantId as number }, apiRequest),
    enabled: canQuery,
  });
  const eligibleDomains = useMemo(() => Array.from(new Set(
    (keys ?? [])
      .filter((key) => key.is_active && key.dns_status === 'verified')
      .map((key) => key.domain.toLowerCase()),
  )).sort(), [keys]);

  const mutation = useMutation({
    mutationFn: (patch: Partial<Pick<ARCSettings, 'enabled' | 'signing_domain'>>) =>
      putARCSettings(patch, apiRequest),
    onSuccess: (updated) => {
      queryClient.setQueryData(queryKey, updated);
      toast.success(t('saveSuccess'));
    },
    onError: (error) => toast.error(apiErrorMessage(error, t('saveFail'))),
  });

  const loading = settingsLoading || keysLoading;
  const selectedDomain = settings?.signing_domain ?? '';
  const enableDomain = eligibleDomains.includes(selectedDomain)
    ? selectedDomain
    : (eligibleDomains[0] ?? '');

  if (!canQuery && !platformWithoutTenant) return null;

  return (
    <div className="rounded-lg border border-border/60 bg-muted/10" data-testid="arc-sealing-section">
      <Collapsible open={open} onOpenChange={setOpen}>
        <button
          type="button"
          onClick={() => setOpen((value) => !value)}
          className="flex w-full items-center gap-2 px-4 py-3 text-left"
          aria-expanded={open}
        >
          <ChevronDown className={cn('h-4 w-4 shrink-0 transition-transform duration-200', open && 'rotate-180')} />
          <ShieldCheck className="h-4 w-4 shrink-0 text-muted-foreground" />
          <div className="min-w-0">
            <div className="text-sm font-semibold">{t('title')}</div>
            <p className="text-xs text-muted-foreground">{t('description')}</p>
          </div>
        </button>

        <CollapsibleContent>
          <div className="space-y-4 px-4 pb-4">
            {platformWithoutTenant ? (
              <p className="rounded-md border border-dashed border-border/70 bg-background/60 px-3 py-6 text-center text-sm text-muted-foreground">
                {t('selectTenant')}
              </p>
            ) : loading || !settings ? (
              <div className="flex items-center justify-center gap-2 py-8 text-muted-foreground">
                <Loader2 className="h-5 w-5 animate-spin" />
                <span className="text-sm">{t('loading')}</span>
              </div>
            ) : (
              <>
                <div className="flex min-w-0 items-center justify-between gap-4 rounded-lg border border-border/60 bg-background p-4">
                  <div className="min-w-0 space-y-1">
                    <Label htmlFor="arc-enabled" className="font-medium">{t('enabled')}</Label>
                    <p className="text-xs text-muted-foreground">{t('enabledDescription')}</p>
                  </div>
                  <Switch
                    id="arc-enabled"
                    data-testid="arc-enabled"
                    disabled={mutation.isPending || (!settings.enabled && !enableDomain)}
                    checked={settings.enabled}
                    onCheckedChange={(enabled) => mutation.mutate(enabled
                      ? { enabled: true, signing_domain: enableDomain }
                      : { enabled: false })}
                  />
                </div>

                <div className="max-w-xl space-y-2">
                  <Label htmlFor="arc-signing-domain" className="font-medium">{t('signingDomain')}</Label>
                  <select
                    id="arc-signing-domain"
                    data-testid="arc-signing-domain"
                    disabled={!settings.enabled || mutation.isPending}
                    value={selectedDomain}
                    onChange={(event) => mutation.mutate({ signing_domain: event.target.value })}
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <option value="">{t('none')}</option>
                    {selectedDomain && !eligibleDomains.includes(selectedDomain) && (
                      <option value={selectedDomain} disabled>{t('unavailable', { domain: selectedDomain })}</option>
                    )}
                    {eligibleDomains.map((domain) => <option key={domain} value={domain}>{domain}</option>)}
                  </select>
                  <p className="text-xs text-muted-foreground">{t('signingDomainDescription')}</p>
                  {eligibleDomains.length === 0 && (
                    <p className="text-xs text-amber-600 dark:text-amber-400">{t('noKeys')}</p>
                  )}
                </div>
              </>
            )}
          </div>
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
}
