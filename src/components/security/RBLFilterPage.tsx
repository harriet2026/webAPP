'use client';

import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useTranslations } from 'next-intl';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { HelpCircle, Plus, X } from 'lucide-react';
import { toast } from 'sonner';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { PageHeader, PageShell, PageSurface } from '@/components/shared/page-shell';
import { useAuth } from '@/contexts/auth-context';
import { ApiError, useApiRequest } from '@/lib/api/client';
import { usePointerHover } from '@/hooks/use-pointer-hover';
import { cn } from '@/lib/utils';
import {
  getDetectionProfiles,
  createDetectionProfile,
  updateDetectionProfile,
  deleteDetectionProfile,
  type DetectionProfile,
} from '@/lib/api/detection-profiles';
import { getRBLFilterRules, createRBLFilterRule, updateRBLFilterRule } from '@/lib/api/rbl-filter';
import type { RBLFilterRulePayload } from '@/types/rbl-filter';
import {
  parseRblConfig,
  diffRblConfig,
  buildProfileValue,
  findCanonicalRule,
  mapGreylistConfig,
  unmapGreylistConfig,
  validateGreylistForm,
  RBL_CANONICAL_RULE_NAME,
  type GreylistFormConfig,
  type RblImmediateAction,
} from './rbl-config-serde';
import { ModuleMasterSwitch } from '@/components/security/ModuleMasterSwitch';

const DOMAIN_REGEX = /^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)+$/;

const DEFAULT_RBL_CONFIG = {
  servers: ['zen.spamhaus.org', 'bl.spamcop.net', 'b.barracudacentral.org'],
  timeout: '5',
  action: 'block' as RblImmediateAction,
};

// GT-12263: PRD §3「关键字段悬浮提示」— 预置 RBL 服务器 Badge 的来源说明文案；
// 非预置（管理员自行添加）的服务器回退到通用 RBL 服务器说明。
const SERVER_TIP_KEY: Record<string, string> = {
  'zen.spamhaus.org': 'rblFilter.serverTipZenSpamhaus',
  'bl.spamcop.net': 'rblFilter.serverTipBlSpamcop',
  'b.barracudacentral.org': 'rblFilter.serverTipBarracuda',
};

// GT-12263: 即时处置动作各自的帮助说明（PRD §3 阻断/隔离/标记动作行）。
const ACTION_TIP_KEY: Record<RblImmediateAction, string> = {
  block: 'rblFilter.actionBlockTip',
  quarantine: 'rblFilter.actionQuarantineTip',
  mark: 'rblFilter.actionMarkTip',
};

const RBL_IMMEDIATE_ACTIONS: RblImmediateAction[] = ['block', 'quarantine', 'mark'];

const DEFAULT_GREYLIST_CONFIG: GreylistFormConfig = {
  mode: 'delay',
  delaySeconds: '600',
  windowSeconds: '600',
  maxRequests: '5',
  whitelistTTL: '24',
  exemptAuthenticated: true,
  exemptWhitelisted: true,
  exemptInternal: false,
};

function cloneGreylistConfig(config: GreylistFormConfig): GreylistFormConfig {
  return { ...config };
}

export function RBLFilterPage({ embedded }: { embedded?: boolean } = {}) {
  const t = useTranslations();
  const { isSystemAdmin } = useAuth();
  const { apiRequest } = useApiRequest();
  const queryClient = useQueryClient();

  const { data: rblProfiles, isLoading: profilesLoading } = useQuery({
    queryKey: ['rbl-detection-profiles'],
    queryFn: () => getDetectionProfiles('rbl', apiRequest),
    enabled: embedded || isSystemAdmin,
  });
  const { data: rblRulesData, isLoading: rulesLoading } = useQuery({
    queryKey: ['rbl-canonical-rule'],
    queryFn: () => getRBLFilterRules({ match_mode: 'any', page_size: 200 }, apiRequest),
    enabled: embedded || isSystemAdmin,
  });
  const isLoading = profilesLoading || rulesLoading;

  const [enabled, setEnabled] = useState(true);
  const [servers, setServers] = useState<string[]>(DEFAULT_RBL_CONFIG.servers);
  const [newServer, setNewServer] = useState('');
  const [serverError, setServerError] = useState('');
  const [timeout, setTimeoutValue] = useState(DEFAULT_RBL_CONFIG.timeout);
  const [timeoutError, setTimeoutError] = useState('');
  const [action, setAction] = useState<RblImmediateAction>(DEFAULT_RBL_CONFIG.action);
  const [greylistEnabled, setGreylistEnabled] = useState(false);
  const [greylistConfig, setGreylistConfig] = useState<GreylistFormConfig>(DEFAULT_GREYLIST_CONFIG);
  const [greylistDraft, setGreylistDraft] = useState<GreylistFormConfig>(DEFAULT_GREYLIST_CONFIG);
  const [greylistDialogOpen, setGreylistDialogOpen] = useState(false);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);

  const [savedConfig, setSavedConfig] = useState({
    enabled: true,
    servers: DEFAULT_RBL_CONFIG.servers,
    timeout: DEFAULT_RBL_CONFIG.timeout,
    action: DEFAULT_RBL_CONFIG.action,
    greylistEnabled: false,
    greylist: DEFAULT_GREYLIST_CONFIG,
  });

  const [baselineProfiles, setBaselineProfiles] = useState<DetectionProfile[]>([]);
  const [loadedOnce, setLoadedOnce] = useState(false);

  /* eslint-disable react-hooks/set-state-in-effect -- hydrate the editable draft once from the remote query snapshot */
  useEffect(() => {
    if (isLoading || loadedOnce || !rblProfiles || !rblRulesData) return;
    const cfg = parseRblConfig(rblProfiles, rblRulesData.items ?? [], {
      timeout: DEFAULT_RBL_CONFIG.timeout,
      action: 'block',
    });
    // GT-11866 R2: 后端无 RBL 服务器时，预置常用服务器（zen.spamhaus.org 等）作为
    // 起始草稿并置 unsaved，提示管理员保存以落库；有则用后端实际值。
    const usePresets = cfg.servers.length === 0;
    setServers(usePresets ? DEFAULT_RBL_CONFIG.servers : cfg.servers);
    setTimeoutValue(cfg.timeout);
    setAction(cfg.action);
    setGreylistEnabled(cfg.greylistEnabled);
    const loadedGreylist = cfg.greylist ? unmapGreylistConfig(cfg.greylist) : DEFAULT_GREYLIST_CONFIG;
    setGreylistConfig(loadedGreylist);
    setGreylistDraft(cloneGreylistConfig(loadedGreylist));
    setEnabled(cfg.enabled);
    setBaselineProfiles(rblProfiles);
    setSavedConfig({
      enabled: cfg.enabled,
      servers: cfg.servers,
      timeout: cfg.timeout,
      action: cfg.action,
      greylistEnabled: cfg.greylistEnabled,
      greylist: loadedGreylist,
    });
    setHasUnsavedChanges(usePresets);
    setLoadedOnce(true);
  }, [isLoading, loadedOnce, rblProfiles, rblRulesData]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const actionLabel = useMemo<Record<RblImmediateAction, string>>(
    () => ({
      block: t('rblFilter.actionBlock'),
      quarantine: t('rblFilter.actionQuarantine'),
      mark: t('rblFilter.actionMark'),
    }),
    [t],
  );

  const [isSaving, setIsSaving] = useState(false);

  const saveMutation = useMutation({
    mutationFn: async () => {
      const timeoutChanged = timeout.trim() !== savedConfig.timeout;
      const diff = diffRblConfig(
        baselineProfiles,
        {
          enabled,
          servers,
          timeout: timeout.trim(),
          action,
          greylistEnabled,
          greylist: greylistEnabled ? mapGreylistConfig(greylistConfig) : undefined,
        },
        timeoutChanged,
      );
      const value = buildProfileValue(timeout.trim());
      // servers
      for (const name of diff.serversToAdd) {
        try {
          await createDetectionProfile({ config_type: 'rbl', name, value, is_active: true }, apiRequest);
        } catch (err) {
          // 409 = a prior partially-applied attempt already created this profile
          // (unique index config_type/name/tenant/origin) — treat as converged
          // so a retry against the stale baseline doesn't loop on the same error.
          if (err instanceof ApiError && err.status === 409) continue;
          throw err;
        }
      }
      for (const id of diff.profileIdsToDelete) {
        try {
          await deleteDetectionProfile(id, apiRequest);
        } catch (err) {
          // 404 = a prior partially-applied attempt already deleted this profile —
          // converged, continue. Any other error (e.g. 409 "referenced by rules")
          // is a real error the user must see and must still surface.
          if (err instanceof ApiError && err.status === 404) continue;
          if (err instanceof ApiError && err.status === 409) {
            const count = typeof err.body.referenced_count === 'number' ? err.body.referenced_count : 0;
            throw new Error(t('rblFilter.serverReferenced', { count }));
          }
          throw err;
        }
      }
      for (const id of diff.profilesToRetime) {
        await updateDetectionProfile(id, { value }, apiRequest);
      }
      // canonical rule
      const canonical = findCanonicalRule(rblRulesData?.items ?? []);
      const payload: RBLFilterRulePayload = {
        name: RBL_CANONICAL_RULE_NAME, match_mode: 'any', product_action: diff.action, priority: canonical?.priority ?? 100, is_active: diff.enabled,
      };
      if (diff.greylist) {
        payload.greylist = diff.greylist;
      }
      if (canonical) {
        await updateRBLFilterRule(canonical.id, payload, apiRequest);
      } else {
        await createRBLFilterRule(payload, apiRequest);
      }
    },
    onMutate: () => {
      setIsSaving(true);
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['rbl-detection-profiles'] });
      await queryClient.invalidateQueries({ queryKey: ['rbl-canonical-rule'] });
      setLoadedOnce(false); // 允许 effect 用新数据刷新基线
      setHasUnsavedChanges(false);
      toast.success(t('rblFilter.saveSuccess'));
    },
    onError: (err: unknown) => {
      const msg = err instanceof Error ? err.message : t('common.error');
      toast.error(msg);
      // 不清 unsaved、不刷新基线，草稿保留可重试
    },
    onSettled: () => {
      // Runs after onSuccess/onError (and their awaited work) complete, so the
      // save button stays disabled for the whole cycle — closes the re-entrancy
      // window where isPending flips false before baselineProfiles is refreshed.
      setIsSaving(false);
    },
  });

  if (!embedded && !isSystemAdmin) {
    return (
      <PageShell>
        <PageHeader title={t('rblFilter.title')} />
        <div className="flex items-center justify-center py-20 text-muted-foreground">
          {t('common.notAuthorized')}
        </div>
      </PageShell>
    );
  }

  if (isLoading && !loadedOnce) {
    return (
      <PageShell>
        <PageSurface>
          <div className="p-6 text-sm text-muted-foreground">{t('common.loading')}</div>
        </PageSurface>
      </PageShell>
    );
  }

  const markDirty = () => setHasUnsavedChanges(true);

  const validateServer = (value: string) => {
    const domain = value.trim().toLowerCase();
    if (!domain) return t('rblFilter.domainRequired');
    if (!DOMAIN_REGEX.test(domain)) return t('rblFilter.domainInvalid');
    if (servers.includes(domain)) return t('rblFilter.domainDuplicate');
    return '';
  };

  const addServer = () => {
    const domain = newServer.trim().toLowerCase();
    const error = validateServer(domain);
    if (error) {
      setServerError(error);
      if (domain) toast.error(error);
      return;
    }
    setServers((current) => [...current, domain]);
    setNewServer('');
    setServerError('');
    markDirty();
  };

  const removeServer = (server: string) => {
    if (servers.length <= 1) {
      toast.error(t('rblFilter.keepOneServer'));
      return;
    }
    setServers((current) => current.filter((item) => item !== server));
    markDirty();
  };

  const updateTimeout = (value: string) => {
    setTimeoutValue(value);
    setTimeoutError('');
    markDirty();
  };

  const validateTimeout = () => {
    const parsed = Number(timeout);
    if (!timeout.trim()) {
      setTimeoutValue(DEFAULT_RBL_CONFIG.timeout);
      setTimeoutError('');
      return true;
    }
    if (!Number.isInteger(parsed) || parsed < 1 || parsed > 30) {
      setTimeoutError(t('rblFilter.timeoutRangeError'));
      return false;
    }
    setTimeoutError('');
    return true;
  };

  const openGreylistDialog = () => {
    setGreylistDraft(cloneGreylistConfig(greylistConfig));
    setGreylistDialogOpen(true);
  };

  const confirmGreylistDialog = () => {
    const delay = Number(greylistDraft.delaySeconds);
    const validationError = validateGreylistForm(greylistDraft);
    if (validationError) {
      const errorKeys = {
        delay: 'rblFilter.greylistDelayInvalid',
        window: 'rblFilter.greylistWindowInvalid',
        windowBeforeDelay: 'rblFilter.greylistWindowBeforeDelay',
        maxRequests: 'rblFilter.greylistMaxRequestsInvalid',
        ttl: 'rblFilter.greylistTTLInvalid',
      } as const;
      toast.error(t(errorKeys[validationError]));
      return;
    }

    if (greylistDraft.mode === 'delay' && delay < 60) {
      toast.warning(t('rblFilter.greylistDelayShortWarning'));
    }
    if (greylistDraft.mode === 'delay' && delay > 3600) {
      toast.warning(t('rblFilter.greylistDelayLongWarning'));
    }

    setGreylistConfig(cloneGreylistConfig(greylistDraft));
    setGreylistDialogOpen(false);
    markDirty();
  };

  const handleSave = () => {
    if (saveMutation.isPending || isSaving) return;
    if (servers.length === 0) {
      toast.error(t('rblFilter.serverRequired'));
      return;
    }
    if (!validateTimeout()) return;

    saveMutation.mutate();
  };

  const handleCancel = () => {
    setEnabled(savedConfig.enabled);
    setServers([...savedConfig.servers]);
    setTimeoutValue(savedConfig.timeout);
    setAction(savedConfig.action);
    setGreylistEnabled(savedConfig.greylistEnabled);
    setGreylistConfig(cloneGreylistConfig(savedConfig.greylist));
    setServerError('');
    setTimeoutError('');
    setNewServer('');
    setHasUnsavedChanges(false);
  };

  const greylistSummary =
    greylistConfig.mode === 'delay'
      ? t('rblFilter.greylistModeSummaryDelay', { seconds: greylistConfig.delaySeconds })
      : t('rblFilter.greylistModeSummaryRate', {
          seconds: greylistConfig.windowSeconds,
          max: greylistConfig.maxRequests,
        });

  const configBody = (
    <TooltipProvider>
      <div className="-mx-6 -mt-6 overflow-hidden">
        <div className="grid gap-6 px-6 py-5 md:grid-cols-2">
          <div className="space-y-3">
            <Label className="font-medium">{t('rblFilter.rblServers')}</Label>
            <div className="space-y-2">
              {servers.map((server) => (
                <div key={server} className="flex items-center gap-2">
                  {/* GT-12263: 悬停服务器 Badge 显示该服务器来源/说明（PRD §3、TC015） */}
                  <Tooltip>
                    <TooltipTrigger render={<span className="inline-flex cursor-help" tabIndex={0} />}>
                      <Badge variant="secondary" className="py-1.5 px-3 font-mono text-sm">
                        {server}
                      </Badge>
                    </TooltipTrigger>
                    <TooltipContent className="max-w-[300px]">
                      {t(SERVER_TIP_KEY[server] ?? 'rblFilter.serverTipGeneric')}
                    </TooltipContent>
                  </Tooltip>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7"
                    disabled={servers.length <= 1}
                    onClick={() => removeServer(server)}
                    title={servers.length <= 1 ? t('rblFilter.keepOneServer') : t('rblFilter.deleteServer')}
                  >
                    <X className="h-3 w-3" />
                    <span className="sr-only">{t('rblFilter.deleteServer')}</span>
                  </Button>
                </div>
              ))}
            </div>

            <div className="flex items-start gap-2 pt-1">
              <div className="flex-1 space-y-1">
                <Input
                  placeholder="rbl.example.com"
                  value={newServer}
                  onChange={(event) => {
                    setNewServer(event.target.value);
                    setServerError('');
                  }}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' && newServer.trim()) {
                      event.preventDefault();
                      addServer();
                    }
                  }}
                />
                {serverError ? <p className="text-xs text-destructive">{serverError}</p> : null}
              </div>
              <Button type="button" variant="outline" size="sm" onClick={addServer} disabled={!newServer.trim()}>
                <Plus className="mr-1 h-4 w-4" />
                {t('rblFilter.add')}
              </Button>
            </div>
          </div>

          <div className="space-y-4">
            <div className="space-y-2">
              <div className="flex items-center gap-1">
                <Label>{t('rblFilter.timeout')} (s)</Label>
                <Tooltip>
                  <TooltipTrigger render={<HelpCircle className="h-3.5 w-3.5 text-muted-foreground" />} />
                  <TooltipContent className="max-w-[280px]">
                    {t('rblFilter.timeoutTip')}
                  </TooltipContent>
                </Tooltip>
              </div>
              <Input
                type="number"
                min={1}
                max={30}
                value={timeout}
                onChange={(event) => updateTimeout(event.target.value)}
                onBlur={validateTimeout}
                className={cn('max-w-[120px]', timeoutError && 'border-destructive')}
              />
              {timeoutError ? <p className="text-xs text-destructive">{timeoutError}</p> : null}
            </div>

            {/* Section 1：即时处置动作（三选一 RadioGroup） */}
            <div className="space-y-2">
              <Label className="font-medium">{t('rblFilter.productAction')}</Label>
              <RadioGroup
                value={action}
                onValueChange={(value) => {
                  setAction(value as RblImmediateAction);
                  markDirty();
                }}
                className="space-y-1"
              >
                {RBL_IMMEDIATE_ACTIONS.map((value) => (
                  <div key={value} className="flex items-center gap-2">
                    <RadioGroupItem value={value} id={`rbl-action-${value}`} />
                    <Label htmlFor={`rbl-action-${value}`} className="cursor-pointer font-normal">
                      {actionLabel[value]}
                    </Label>
                    <Tooltip>
                      <TooltipTrigger render={<HelpCircle className="h-3.5 w-3.5 cursor-help text-muted-foreground" />} />
                      <TooltipContent className="max-w-[300px]">{t(ACTION_TIP_KEY[value])}</TooltipContent>
                    </Tooltip>
                  </div>
                ))}
              </RadioGroup>
            </div>
          </div>
        </div>

        {/* Section 2：灰名单策略（独立开关，与即时动作并列） */}
        <div className="border-t border-border px-6 py-5">
          <div className="flex items-start justify-between gap-4">
            <div className="flex-1 space-y-0.5">
              <div className="flex items-center gap-1.5">
                <p className="text-sm font-medium">{t('rblFilter.greylistSectionTitle')}</p>
                <Tooltip>
                  <TooltipTrigger render={<HelpCircle className="h-3.5 w-3.5 cursor-help text-muted-foreground" />} />
                  <TooltipContent className="max-w-[320px]">{t('rblFilter.actionGreylistTip')}</TooltipContent>
                </Tooltip>
              </div>
              <p className="text-xs text-muted-foreground">{t('rblFilter.greylistSectionDesc')}</p>
              {greylistEnabled ? (
                <div className="mt-3 flex items-center gap-3 rounded-lg border border-info/35 bg-info/10 p-3">
                  <div className="flex-1">
                    <p className="text-xs text-info">{greylistSummary}</p>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="shrink-0 border-primary/35 text-primary hover:bg-primary/10"
                    onClick={openGreylistDialog}
                  >
                    {t('rblFilter.greylistConfigure')}
                  </Button>
                </div>
              ) : null}
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={greylistEnabled}
              aria-label={t('rblFilter.greylistEnabled')}
              onClick={() => {
                setGreylistEnabled((v) => !v);
                markDirty();
              }}
              className={cn(
                'relative mt-0.5 inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
                greylistEnabled ? 'bg-primary' : 'bg-input',
              )}
            >
              <span
                className={cn(
                  'pointer-events-none block h-4 w-4 rounded-full bg-background shadow-lg ring-0 transition-transform duration-200',
                  greylistEnabled ? 'translate-x-4' : 'translate-x-0',
                )}
              />
            </button>
          </div>
        </div>

        <div className="sticky bottom-0 z-10 flex items-center justify-between gap-3 border-t border-border bg-card/95 px-6 py-4 backdrop-blur-sm shadow-[0_-4px_12px_rgba(15,23,42,0.06)]">
          <div className="min-w-0">
            {hasUnsavedChanges ? (
              <div className="flex items-center gap-2 text-warning">
                <span className="h-2 w-2 rounded-full bg-warning" />
                <span className="text-sm">{t('rblFilter.unsavedChanges')}</span>
              </div>
            ) : (
              <span className="text-sm text-muted-foreground">{t('rblFilter.noUnsavedChanges')}</span>
            )}
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <Button type="button" variant="outline" size="sm" onClick={handleCancel} disabled={!hasUnsavedChanges}>
              {t('common.cancel')}
            </Button>
            <Button type="button" size="sm" onClick={handleSave} disabled={!hasUnsavedChanges || saveMutation.isPending || isSaving}>
              {t('common.save')}
            </Button>
          </div>
        </div>
      </div>

      <Dialog open={greylistDialogOpen} onOpenChange={setGreylistDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{t('rblFilter.greylistConfig')}</DialogTitle>
            <DialogDescription>{t('rblFilter.greylistConfigDesc')}</DialogDescription>
          </DialogHeader>

          <div className="space-y-5 py-2">
            <RadioGroup
              value={greylistDraft.mode}
              onValueChange={(value) =>
                setGreylistDraft((current) => ({ ...current, mode: value as GreylistFormConfig['mode'] }))
              }
              className="space-y-3"
            >
              <GreylistModeOption
                selected={greylistDraft.mode === 'delay'}
                onSelect={() => setGreylistDraft((current) => ({ ...current, mode: 'delay' }))}
              >
                <RadioGroupItem value="delay" id="rbl-greylist-delay" className="mt-0.5 shrink-0" />
                <div className="space-y-2">
                  <Label htmlFor="rbl-greylist-delay" className="cursor-pointer text-sm font-medium">
                    {t('rblFilter.greylistModeSummaryDelay', { seconds: greylistDraft.delaySeconds })}
                  </Label>
                  <div className="flex flex-wrap items-center gap-2">
                    <Input
                      type="number"
                      min={10}
                      value={greylistDraft.delaySeconds}
                      onClick={(event) => event.stopPropagation()}
                      onChange={(event) =>
                        setGreylistDraft((current) => ({ ...current, delaySeconds: event.target.value }))
                      }
                      className="h-7 w-20 px-2 text-sm"
                    />
                    <span className="text-sm text-muted-foreground">{t('rblFilter.greylistDelayDesc')}</span>
                  </div>
                </div>
              </GreylistModeOption>

              <GreylistModeOption
                selected={greylistDraft.mode === 'rateLimit'}
                onSelect={() => setGreylistDraft((current) => ({ ...current, mode: 'rateLimit' }))}
              >
                <RadioGroupItem value="rateLimit" id="rbl-greylist-rate" className="mt-0.5 shrink-0" />
                <div className="space-y-2">
                  <Label htmlFor="rbl-greylist-rate" className="cursor-pointer text-sm font-medium">
                    {t('rblFilter.greylistModeSummaryRate', {
                      seconds: greylistDraft.windowSeconds,
                      max: greylistDraft.maxRequests,
                    })}
                  </Label>
                  <div className="flex flex-wrap items-center gap-2">
                    <Input
                      type="number"
                      min={10}
                      value={greylistDraft.windowSeconds}
                      onClick={(event) => event.stopPropagation()}
                      onChange={(event) =>
                        setGreylistDraft((current) => ({ ...current, windowSeconds: event.target.value }))
                      }
                      className="h-7 w-20 px-2 text-sm"
                    />
                    <span className="text-sm text-muted-foreground">{t('rblFilter.greylistRateDesc')}</span>
                  </div>
                </div>
              </GreylistModeOption>
            </RadioGroup>

            {greylistDraft.mode === 'rateLimit' ? (
              <div className="flex items-center gap-3">
                <Label className="shrink-0 text-sm">{t('rblFilter.greylistMaxRequests')}</Label>
                <Input
                  type="number"
                  min={1}
                  value={greylistDraft.maxRequests}
                  onChange={(event) =>
                    setGreylistDraft((current) => ({ ...current, maxRequests: event.target.value }))
                  }
                  className="h-7 w-20 px-2 text-sm"
                />
              </div>
            ) : null}

            <div className="flex items-center gap-3 pt-1">
              <Label className="shrink-0 text-sm">{t('rblFilter.greylistWhitelistTTL')}</Label>
              <Input
                type="number"
                min={1}
                value={greylistDraft.whitelistTTL}
                onChange={(event) =>
                  setGreylistDraft((current) => ({ ...current, whitelistTTL: event.target.value }))
                }
                className="h-7 w-20 px-2 text-sm"
              />
              <span className="text-sm text-muted-foreground">{t('rblFilter.greylistHours')}</span>
              <Tooltip>
                <TooltipTrigger render={<HelpCircle className="h-3.5 w-3.5 cursor-help text-muted-foreground" />} />
                <TooltipContent className="max-w-[260px]">
                  {t('rblFilter.greylistWhitelistTTLTip')}
                </TooltipContent>
              </Tooltip>
            </div>

            <div className="space-y-2 border-t border-border pt-4">
              <Label className="text-sm font-medium">{t('rblFilter.greylistExemptions')}</Label>
              <div className="space-y-2">
                {[
                  ['exemptAuthenticated', t('rblFilter.greylistExemptAuth')],
                  ['exemptWhitelisted', t('rblFilter.greylistExemptWhitelist')],
                  ['exemptInternal', t('rblFilter.greylistExemptInternal')],
                ].map(([key, label]) => (
                  <label key={key} className="flex cursor-pointer items-center gap-2">
                    <Checkbox
                      checked={greylistDraft[key as keyof GreylistFormConfig] as boolean}
                      onCheckedChange={(checked) =>
                        setGreylistDraft((current) => ({ ...current, [key]: checked === true }))
                      }
                    />
                    <span className="text-sm text-foreground">{label}</span>
                  </label>
                ))}
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setGreylistDialogOpen(false)}>
              {t('common.cancel')}
            </Button>
            <Button type="button" onClick={confirmGreylistDialog}>
              {t('common.confirm')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </TooltipProvider>
  );

  const content = (
    <div className="space-y-4">
      {configBody}
    </div>
  );

  if (embedded) return <ModuleMasterSwitch page="rbl_filter">{content}</ModuleMasterSwitch>;

  return (
    <PageShell>
      <PageHeader title={t('rblFilter.title')} description={t('rblFilter.description')} />
      <ModuleMasterSwitch page="rbl_filter">{content}</ModuleMasterSwitch>
    </PageShell>
  );
}

// 灰名单模式可选卡片（柔和交互反馈规格 §6.4/§7.2）：hover 为 pointer 驱动的 muted 表面，
// 选中态（primary 淡表面）不被 hover 覆盖；键盘可达性由内部 RadioGroupItem 承担。
function GreylistModeOption({
  selected,
  onSelect,
  children,
}: {
  selected: boolean;
  onSelect: () => void;
  children: ReactNode;
}) {
  const { pointerHoverProps } = usePointerHover<HTMLDivElement>({ disabled: selected });
  return (
    <div
      className={cn(
        'flex cursor-pointer items-start gap-3 rounded-lg border p-4',
        'transition-[background-color,border-color] duration-[180ms] ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none',
        selected ? 'border-primary bg-primary/10' : 'border-border data-[hovered=true]:bg-muted/40',
      )}
      onClick={onSelect}
      {...pointerHoverProps}
    >
      {children}
    </div>
  );
}
