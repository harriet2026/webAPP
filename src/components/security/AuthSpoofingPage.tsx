'use client';

import { useState, useEffect } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useApiRequest } from '@/lib/api/client';
import { getAuthSpoofingConfig, getObserveStats, putAuthSpoofingConfig } from '@/lib/api/auth-spoofing';
import type { AuthSpoofingConfig, CheckItem } from '@/types/auth-spoofing';
import { Button } from '@/components/ui/button';
import { Loader2, Save } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/auth-context';
import { useProductForm } from '@/contexts/product-form-context';
import { PageHeader, PageShell } from '@/components/shared/page-shell';
import { FormatChecksSection } from './auth-spoofing/FormatChecksSection';
import { ProtocolChecksSection } from './auth-spoofing/ProtocolChecksSection';
import { SimilarDomainSection } from './auth-spoofing/SimilarDomainSection';
import { DisplayNameSpoofSection } from './auth-spoofing/DisplayNameSpoofSection';
import { ExceptionRulesEntry } from './auth-spoofing/ExceptionRulesEntry';
import { ModuleMasterSwitch } from '@/components/security/ModuleMasterSwitch';

const DEFAULT_CONFIG: AuthSpoofingConfig = {
  format_checks: {
    mailfrom_empty: { enabled: true, action: 'accept', observe_mode: false },
    mailfrom_invalid: { enabled: true, action: 'reject', observe_mode: false },
    envelope_header_mismatch: { enabled: true, action: 'quarantine', observe_mode: false },
  },
  protocol_checks: {
    template: 'standard',
    observe_mode: false,
    spf: {
      fail: { enabled: true, action: 'reject', observe_mode: false },
      softfail: { enabled: true, action: 'quarantine', observe_mode: false },
      none: { enabled: true, action: 'audit', observe_mode: false },
      temperror: { enabled: true, action: 'audit', observe_mode: false },
    },
    dkim: {
      fail: { enabled: true, action: 'quarantine', observe_mode: false },
      neutral: { enabled: true, action: 'quarantine', observe_mode: false },
      partial: { enabled: false, action: 'accept', observe_mode: false },
      none: { enabled: true, action: 'audit', observe_mode: false },
    },
    dmarc: {
      reject: { enabled: true, action: 'reject', observe_mode: false },
      quarantine: { enabled: true, action: 'quarantine', observe_mode: false },
      none: { enabled: true, action: 'audit', observe_mode: false },
    },
    ptr: {
      norecord: { enabled: true, action: 'audit', observe_mode: false },
      temperror: { enabled: true, action: 'audit', observe_mode: false },
      ehlomismatch: { enabled: true, action: 'quarantine', observe_mode: false },
      amismatch: { enabled: true, action: 'quarantine', observe_mode: false },
    },
  },
  similar_domain: {
    enabled: false,
    action: 'quarantine',
    observe_mode: false,
    threshold: 2,
    protected_domains: [],
  },
  display_name_spoof: {
    inbound: { enabled: true, action: 'quarantine', observe_mode: false },
    outbound: { enabled: true, action: 'quarantine', observe_mode: false },
    internal: { enabled: true, action: 'quarantine', observe_mode: false },
    internal_users: [],
  },
};

// Merge a loaded config over DEFAULT_CONFIG so every protocol subkey (and section)
// is present with a sensible demo default even if the backend payload omits it
// (e.g. during a schema transition / older data). Loaded values win where present.
function mergeGroup(
  def: Record<string, CheckItem>,
  got?: Record<string, CheckItem>,
): Record<string, CheckItem> {
  return { ...def, ...(got ?? {}) };
}

function mergeWithDefaults(cfg: AuthSpoofingConfig): AuthSpoofingConfig {
  const p = cfg.protocol_checks;
  return {
    ...DEFAULT_CONFIG,
    ...cfg,
    format_checks: { ...DEFAULT_CONFIG.format_checks, ...(cfg.format_checks ?? {}) },
    protocol_checks: {
      ...DEFAULT_CONFIG.protocol_checks,
      ...(p ?? {}),
      spf: mergeGroup(DEFAULT_CONFIG.protocol_checks.spf, p?.spf),
      dkim: mergeGroup(DEFAULT_CONFIG.protocol_checks.dkim, p?.dkim),
      dmarc: mergeGroup(DEFAULT_CONFIG.protocol_checks.dmarc, p?.dmarc),
      ptr: mergeGroup(DEFAULT_CONFIG.protocol_checks.ptr, p?.ptr),
    },
    similar_domain: { ...DEFAULT_CONFIG.similar_domain, ...(cfg.similar_domain ?? {}) },
    display_name_spoof: { ...DEFAULT_CONFIG.display_name_spoof, ...(cfg.display_name_spoof ?? {}) },
  };
}

export function AuthSpoofingPage({ embedded }: { embedded?: boolean } = {}) {
  const t = useTranslations('authSpoofing');
  const queryClient = useQueryClient();
  const { apiRequest } = useApiRequest();
  const { isSystemAdmin, user } = useAuth();
  const { capabilities } = useProductForm();

  const [localConfig, setLocalConfig] = useState<AuthSpoofingConfig>(DEFAULT_CONFIG);
  const [lastSavedConfig, setLastSavedConfig] = useState<AuthSpoofingConfig>(DEFAULT_CONFIG);

  const { data: config, isLoading } = useQuery({
    queryKey: ['auth-spoofing-config'],
    queryFn: () => getAuthSpoofingConfig(apiRequest),
    enabled: isSystemAdmin || user?.role === 'tenant_admin',
  });

  // Seed the editable local copy from the loaded server config (standard
  // editable-copy-of-server-state pattern; runs only when `config` changes).
  useEffect(() => {
    if (config) {
      const mergedConfig = mergeWithDefaults(config);
      setLocalConfig(mergedConfig);
      setLastSavedConfig(mergedConfig);
    }
  }, [config]);

  const saveMutation = useMutation({
    mutationFn: async (data: AuthSpoofingConfig) => {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 10_000);
      try {
        return await putAuthSpoofingConfig(data, apiRequest, controller.signal);
      } finally {
        clearTimeout(timeout);
      }
    },
    onSuccess: (result, savedConfig) => {
      setLastSavedConfig(savedConfig);
      queryClient.setQueryData(['auth-spoofing-config'], savedConfig);
      toast.success(t('saveSuccess'));
      for (const warning of result.warnings ?? []) {
        toast.warning(warning);
      }
    },
    onError: () => {
      // Keep the edited local copy so a transient failure can be retried.
      toast.error(t('saveFailed'));
    },
  });

  const isChanged = JSON.stringify(localConfig) !== JSON.stringify(lastSavedConfig);

  const saveButton = (
    <Button
      type="button"
      data-testid="auth-spoofing-save"
      className="min-w-28"
      onClick={() => saveMutation.mutate(localConfig)}
      disabled={isLoading || !isChanged || saveMutation.isPending}
    >
      {saveMutation.isPending ? (
        <Loader2 className="mr-1 h-4 w-4 animate-spin" />
      ) : (
        <Save className="mr-1 h-4 w-4" />
      )}
      {t('save')}
    </Button>
  );

  // Only used for the "预计丢弃" badge next to the protocol global-observe toggle.
  const { data: observeStatsTotal } = useQuery({
    queryKey: ['auth-spoofing-observe-stats-total'],
    queryFn: () => getObserveStats(7, apiRequest),
    enabled: isSystemAdmin || user?.role === 'tenant_admin',
  });
  const wouldDrop = (observeStatsTotal?.points ?? []).reduce((sum, p) => sum + p.hits, 0);

  if (!isSystemAdmin && user?.role !== 'tenant_admin') {
    return (
      <PageShell>
        <PageHeader title={t('title')} />
        <div className="flex items-center justify-center py-20 text-muted-foreground">
          {t('notAuthorized')}
        </div>
      </PageShell>
    );
  }

  const content = (
    <ModuleMasterSwitch page="auth_spoofing">
    <div className="space-y-4">
      {/* demo 对齐：不渲染重复的模块级标题/描述/观察提示条；父级策略卡头部已提供标题与启用开关。 */}
      {isLoading && (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="h-6 w-6 animate-spin" />
        </div>
      )}

      {!isLoading && (
        <div className="space-y-4">
          <FormatChecksSection
            config={localConfig.format_checks}
            onChange={(format_checks) => setLocalConfig((c) => ({ ...c, format_checks }))}
          />

          <ProtocolChecksSection
            config={localConfig.protocol_checks}
            onChange={(protocol_checks) => setLocalConfig((c) => ({ ...c, protocol_checks }))}
            disabled={!isSystemAdmin && user?.role !== 'tenant_admin'}
            ptrReadonly={localConfig.protocol_checks.ptr_readonly ?? false}
            wouldDrop={wouldDrop}
          />

          {!capabilities?.ai && (
            <>
              <SimilarDomainSection
                config={localConfig.similar_domain}
                onChange={(similar_domain) => setLocalConfig((c) => ({ ...c, similar_domain }))}
              />

              <DisplayNameSpoofSection
                config={localConfig.display_name_spoof}
                onChange={(display_name_spoof) => setLocalConfig((c) => ({ ...c, display_name_spoof }))}
              />
            </>
          )}

          <ExceptionRulesEntry />
        </div>
      )}
    </div>
    </ModuleMasterSwitch>
  );

  if (embedded) {
    return (
      <div className="flex h-full min-h-0 flex-col" data-testid="auth-spoofing-embedded-layout">
        <div className="min-h-0 flex-1 overflow-y-auto p-6">
          {content}
        </div>
        <div
          className="flex shrink-0 justify-end border-t border-border/70 bg-background px-6 py-4"
          data-testid="auth-spoofing-footer"
        >
          {saveButton}
        </div>
      </div>
    );
  }

  return (
    <PageShell>
      <PageHeader title={t('title')} />
      {content}
      <div className="flex justify-end border-t border-border/70 pt-4">
        {saveButton}
      </div>
    </PageShell>
  );
}
