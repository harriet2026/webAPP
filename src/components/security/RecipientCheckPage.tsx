'use client';

import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { Info, AlertTriangle } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { cn } from '@/lib/utils';
import {
  getRecipientLimitConfig,
  getRecipientCheckConfig,
  getRecipientDirectoryStatus,
  setRecipientPolicy,
} from '@/lib/api/behavior-control';
import type {
  RecipientLimitAction,
  RecipientLimitConfig,
  RecipientCheckConfig,
  RecipientLimitScope,
} from '@/types/behavior-control';
import { isPublicationPendingResponse, useApiRequest } from '@/lib/api/client';
import {
  acceptScopedConfigMutation,
  type ConfigPatchOperation,
  type ScopedConfigView,
} from '@/lib/api/scoped-configs';
import { PipelinePanelHeader } from './PipelinePanelHeader';
import { useModuleMaster } from './useModuleMaster';

interface Props {
  embedded?: boolean;
}

// 执行动作下拉顺序照 demo：隔离 / 审核 / 阻断 / 丢弃（后端名 quarantine/audit/reject/discard）。
const RECIPIENT_ACTIONS: RecipientLimitAction[] = ['quarantine', 'audit', 'reject', 'discard'];

const DEFAULT_RECIPIENT_LIMIT_CONFIG: RecipientLimitConfig = {
  mode: 'detailed',
  is_active: true,
  inbound_limit: { limit: 30, scope: 'local', action: 'reject' },
  outbound_limit: { limit: 50, scope: 'all', action: 'audit' },
  internal_limit: { limit: 20, scope: 'local', action: 'quarantine' },
  merged_limit: { limit: 50, action: 'audit' },
};

const DEFAULT_RECIPIENT_CHECK_CONFIG: RecipientCheckConfig = {
  existence_enabled: false,
  existence_action: 'reject',
};

// 后端未配置时返回 {limit:0, scope:"", action:""}——空串必须回落到默认，否则
// t(`...action.${""}`) 会解析出 `...action.`（空后缀）而抛 MISSING_MESSAGE。
// limit=0 视为未设置→回落默认（合法值只会是 -1 或 1..1000，见后端校验）。
function coalesceDir(
  def: { limit: number; scope?: RecipientLimitScope; action: RecipientLimitAction },
  cfg?: Partial<{ limit: number; scope?: RecipientLimitScope; action: RecipientLimitAction }> | null,
) {
  return {
    limit: cfg?.limit || def.limit,
    scope: (cfg?.scope || def.scope) as RecipientLimitScope | undefined,
    action: (cfg?.action || def.action) as RecipientLimitAction,
  };
}

function normalizeLimit(config?: Partial<RecipientLimitConfig> | null): RecipientLimitConfig {
  return {
    mode: config?.mode || DEFAULT_RECIPIENT_LIMIT_CONFIG.mode,
    is_active: config?.is_active ?? DEFAULT_RECIPIENT_LIMIT_CONFIG.is_active,
    inbound_limit: coalesceDir(DEFAULT_RECIPIENT_LIMIT_CONFIG.inbound_limit!, config?.inbound_limit),
    outbound_limit: coalesceDir(DEFAULT_RECIPIENT_LIMIT_CONFIG.outbound_limit!, config?.outbound_limit),
    internal_limit: coalesceDir(DEFAULT_RECIPIENT_LIMIT_CONFIG.internal_limit!, config?.internal_limit),
    merged_limit: {
      limit: config?.merged_limit?.limit || DEFAULT_RECIPIENT_LIMIT_CONFIG.merged_limit!.limit,
      action: (config?.merged_limit?.action || DEFAULT_RECIPIENT_LIMIT_CONFIG.merged_limit!.action) as RecipientLimitAction,
    },
  };
}

function normalizeCheck(config?: Partial<RecipientCheckConfig> | null): RecipientCheckConfig {
  return {
    existence_enabled: config?.existence_enabled ?? DEFAULT_RECIPIENT_CHECK_CONFIG.existence_enabled,
    existence_action: config?.existence_action || DEFAULT_RECIPIENT_CHECK_CONFIG.existence_action,
  };
}

function isScopedConfigView(value: unknown): value is ScopedConfigView {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const candidate = value as Partial<ScopedConfigView>;
  return typeof candidate.published === 'boolean'
    && !!candidate.effective
    && typeof candidate.effective === 'object';
}

function recipientPolicyOperations(
  limit: RecipientLimitConfig,
  check: RecipientCheckConfig,
): ConfigPatchOperation[] {
  return [
    { op: 'set', path: 'recipient_policy.limit', value: limit },
    { op: 'set', path: 'recipient_policy.check', value: check },
  ];
}

// A direct scoped-config HTTP 202 contains the authoritative stored row, but
// its effective half can still be the old in-memory snapshot. When this page
// is the first consumer to populate the shared scoped cache there is no prior
// view for acceptScopedConfigMutation() to patch, so reconcile the two halves
// from the submitted policy and the committed stored version.
function reconcileRecipientPolicyView(
  result: ScopedConfigView,
  limit: RecipientLimitConfig,
  check: RecipientCheckConfig,
): ScopedConfigView {
  if (result.published) return result;
  const document = structuredClone(result.effective.document);
  const recipientPolicy = document.recipient_policy;
  document.recipient_policy = {
    ...(recipientPolicy && typeof recipientPolicy === 'object' && !Array.isArray(recipientPolicy)
      ? recipientPolicy as Record<string, unknown>
      : {}),
    limit,
    check,
  };
  const storedVersion = result.stored?.version;
  return {
    ...result,
    effective: {
      ...result.effective,
      platform_version: result.stored?.scope_kind === 'platform' && storedVersion !== undefined
        ? storedVersion
        : result.effective.platform_version,
      tenant_version: result.stored?.scope_kind === 'tenant' && storedVersion !== undefined
        ? storedVersion
        : result.effective.tenant_version,
      document,
    },
  };
}

type DirCfg = { limit: number; action: RecipientLimitAction; scope?: RecipientLimitScope };

// 方向卡：彩色 Badge + 最大收信人 + （仅接收）计数范围 radio + 执行动作 Select + 动作说明。
function DirectionCard({
  direction,
  badgeLabel,
  badgeClass,
  hint,
  config,
  onChange,
  showScope = false,
  t,
}: {
  direction: 'inbound' | 'outbound' | 'internal';
  badgeLabel: string;
  badgeClass: string;
  hint: string;
  config: DirCfg;
  onChange: (next: DirCfg) => void;
  showScope?: boolean;
  t: ReturnType<typeof useTranslations>;
}) {
  return (
    <div data-testid={`recipient-limit-card-${direction}`} className="space-y-3 rounded-lg border border-gray-200 bg-gray-50 p-4 dark:border-gray-700 dark:bg-gray-900">
      <div className="flex items-center gap-2">
        <Badge variant="outline" className={badgeClass}>{badgeLabel}</Badge>
        <span className="text-xs text-muted-foreground">{hint}</span>
      </div>
      <div className={cn('grid grid-cols-1 gap-4', showScope ? 'min-[1366px]:grid-cols-3' : 'min-[1366px]:grid-cols-2')}>
        <div className="space-y-2">
          <Label className="text-xs">{t('recipientCheck.limit.maxRecipients')}</Label>
          <div className="flex items-center gap-2">
            <Input
              data-testid={`recipient-limit-value-${direction}`}
              type="number"
              value={config.limit}
              onChange={(e) => onChange({ ...config, limit: parseInt(e.target.value) || 0 })}
              className="w-20"
              min={-1}
              max={1000}
            />
            <span className="text-sm text-muted-foreground">{t('recipientCheck.limit.unit')}</span>
          </div>
        </div>
        {showScope && (
          <div className="space-y-2" data-testid="recipient-limit-scope-inbound">
            <Label className="text-xs">{t('recipientCheck.limit.countScope')}</Label>
            <RadioGroup
              value={config.scope ?? 'local'}
              onValueChange={(v) => onChange({ ...config, scope: v as RecipientLimitScope })}
              className="flex gap-4"
            >
              <div className="flex items-center space-x-1">
                <RadioGroupItem value="local" id={`scope-local-${badgeLabel}`} data-testid={`recipient-limit-scope-${direction}-local`} />
                <Label htmlFor={`scope-local-${badgeLabel}`} className="cursor-pointer text-xs">
                  {t('recipientCheck.limit.scope.local')}
                </Label>
              </div>
              <div className="flex items-center space-x-1">
                <RadioGroupItem value="all" id={`scope-all-${badgeLabel}`} data-testid={`recipient-limit-scope-${direction}-all`} />
                <Label htmlFor={`scope-all-${badgeLabel}`} className="cursor-pointer text-xs">
                  {t('recipientCheck.limit.scope.all')}
                </Label>
              </div>
            </RadioGroup>
          </div>
        )}
        <div className="space-y-2">
          <Label className="text-xs">{t('recipientCheck.limit.actionLabel')}</Label>
          <Select value={config.action} onValueChange={(v) => onChange({ ...config, action: v as RecipientLimitAction })}>
            <SelectTrigger data-testid={`recipient-limit-action-${direction}`} className="w-full">
              <SelectValue>{t(`recipientCheck.limit.action.${config.action}`)}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              {RECIPIENT_ACTIONS.map((a) => (
                <SelectItem key={a} value={a} data-testid={`recipient-limit-action-option-${a}`}>{t(`recipientCheck.limit.action.${a}`)}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
      <p className="text-xs text-muted-foreground">{t(`recipientCheck.limit.actionDesc.${config.action}`)}</p>
    </div>
  );
}

const BADGE_INBOUND = 'border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-800 dark:bg-blue-950/30 dark:text-blue-300';
const BADGE_OUTBOUND = 'border-green-200 bg-green-50 text-green-700 dark:border-green-800 dark:bg-green-950/30 dark:text-green-300';
const BADGE_INTERNAL = 'border-purple-200 bg-purple-50 text-purple-700 dark:border-purple-800 dark:bg-purple-950/30 dark:text-purple-300';
const BADGE_MERGED = 'border-orange-200 bg-orange-50 text-orange-700 dark:border-orange-800 dark:bg-orange-950/30 dark:text-orange-300';

export function RecipientCheckPage({ embedded = false }: Props) {
  const t = useTranslations();
  const qc = useQueryClient();
  const { apiRequest, effectiveTenantId } = useApiRequest();
  const { enabled: moduleEnabled, saving: moduleSaving, toggle: toggleModule, editable: moduleEditable } = useModuleMaster('recipient_check');

  const [limit, setLimit] = useState<RecipientLimitConfig>(DEFAULT_RECIPIENT_LIMIT_CONFIG);
  const [check, setCheck] = useState<RecipientCheckConfig>(DEFAULT_RECIPIENT_CHECK_CONFIG);
  const [saving, setSaving] = useState(false);
  const [resetting, setResetting] = useState(false);

  // GT-12157：目录可用性改为读真实状态，替代此前写死的 true
  // （写死导致下方的离线告警面板永远不可达，成了死代码）。
  //
  // 语义：存在性验证查的是本地通讯录（contact_book），不是实时打 LDAP，因此
  // 「可用」= 同步健康且数据新鲜；同步失败或数据陈旧时结论不可信，应提示运维。
  const directoryQueryKey = ['recipient-directory-status', effectiveTenantId] as const;
  const limitQueryKey = ['recipient-limit-config', effectiveTenantId] as const;
  const checkQueryKey = ['recipient-check-config', effectiveTenantId] as const;
  const scopedConfigQueryKey = effectiveTenantId === null
    ? (['platform-config', 'antispam'] as const)
    : (['tenant-config', 'antispam', effectiveTenantId] as const);
  const directoryQuery = useQuery({
    queryKey: directoryQueryKey,
    queryFn: async () => getRecipientDirectoryStatus(apiRequest),
    // 状态本身变化不快，但页面停留期间目录可能掉线，给一个温和的轮询。
    refetchInterval: 60_000,
  });
  // 查询未回来之前不渲染告警，避免加载态闪一下"目录离线"。
  const ldapConnected = directoryQuery.data ? directoryQuery.data.available : true;
  const directoryReason = directoryQuery.data?.reason ?? '';

  const limitQuery = useQuery({
    queryKey: limitQueryKey,
    queryFn: async () => normalizeLimit(await getRecipientLimitConfig(apiRequest)),
    retry: false,
  });
  const checkQuery = useQuery({
    queryKey: checkQueryKey,
    queryFn: async () => normalizeCheck(await getRecipientCheckConfig(apiRequest)),
    retry: false,
  });

  const configLoadFailed = limitQuery.isError || checkQuery.isError;
  const configReady = limitQuery.isSuccess && checkQuery.isSuccess && !configLoadFailed;

  useEffect(() => {
    if (limitQuery.data) setLimit(limitQuery.data);
  }, [limitQuery.data]);
  useEffect(() => {
    if (checkQuery.data) setCheck(checkQuery.data);
  }, [checkQuery.data]);

  const acceptSavedPolicy = (
    result: Awaited<ReturnType<typeof setRecipientPolicy>>,
    savedLimit: RecipientLimitConfig,
    savedCheck: RecipientCheckConfig,
  ) => {
    // The compatibility GETs return only the two policy values. Keep their
    // tenant-specific caches on the submitted state for both forms of 202;
    // invalidating here can immediately read the old Manager snapshot and make
    // a successful save look as though it was lost.
    qc.setQueryData(limitQueryKey, savedLimit);
    qc.setQueryData(checkQueryKey, savedCheck);

    const operations = recipientPolicyOperations(savedLimit, savedCheck);
    const current = qc.getQueryData<ScopedConfigView>(scopedConfigQueryKey);
    if (isPublicationPendingResponse(result)) {
      if (current) {
        qc.setQueryData(scopedConfigQueryKey, acceptScopedConfigMutation(current, result, operations));
      }
      return;
    }
    if (isScopedConfigView(result)) {
      qc.setQueryData(
        scopedConfigQueryKey,
        current
          ? acceptScopedConfigMutation(current, result, operations)
          : reconcileRecipientPolicyView(result, savedLimit, savedCheck),
      );
    }
  };

  const handleSave = async () => {
    if (!configReady) return;
    setSaving(true);
    try {
      const result = await setRecipientPolicy(limit, check, apiRequest);
      acceptSavedPolicy(result, limit, check);
      toast.success(t('behaviorControl.toast.saveOk'));
    } catch (e: unknown) {
      toast.error((e as Error)?.message ?? t('common.error'));
    } finally {
      setSaving(false);
    }
  };

  const handleReset = async () => {
    if (!configReady) return;
    setResetting(true);
    try {
      // DELETE 会删除托管规则；recipient_limit 的空配置 is_active=false，
      // 因而“重置为默认”会错误地变成关闭数量限制。默认值必须显式保存，
      // 使配置和由其生成的托管规则一起恢复。
      const defaultLimit = normalizeLimit();
      const defaultCheck = normalizeCheck();
      const result = await setRecipientPolicy(defaultLimit, defaultCheck, apiRequest);
      setLimit(defaultLimit);
      setCheck(defaultCheck);
      acceptSavedPolicy(result, defaultLimit, defaultCheck);
      toast.success(t('behaviorControl.toast.saveOk'));
    } catch (e: unknown) {
      toast.error((e as Error)?.message ?? t('common.error'));
    } finally {
      setResetting(false);
    }
  };

  return (
    <div>
      <PipelinePanelHeader
        title={t('pipeline.recipientCheck')}
        enabled={moduleEnabled}
        onToggle={toggleModule}
        disabled={!moduleEditable || moduleSaving}
        enabledLabel={t('recipientCheck.module.enabled')}
        disabledLabel={t('recipientCheck.module.disabled')}
        ariaLabel={t('recipientCheck.module.switchLabel')}
        switchTitle={moduleEditable ? undefined : t('recipientCheck.module.switchLabel')}
        switchTestId="recipient-check-module-switch"
        titleTestId="recipient-check"
        // 显式给出状态文字的 testid。渲染结果与不传时的默认值
        // (`${titleTestId}-status`) 完全一致，只是把它变成 qc testid 契约防线
        // 能静态看见的字面量（PipelinePanelHeader.tsx:19-22 的说明，
        // UrlProtectionPage.tsx:104 是同样的用法）。
        statusTestId="recipient-check-status"
      >
      <div className="space-y-4">
      {configLoadFailed ? (
        <div
          className="flex flex-col items-center gap-3 rounded-lg border border-destructive/30 bg-destructive/5 p-6 text-center"
          data-testid="recipient-check-load-error"
        >
          <AlertTriangle className="h-6 w-6 text-destructive" />
          <p className="text-sm text-destructive">{t('recipientCheck.loadFailed')}</p>
          <Button
            type="button"
            variant="outline"
            onClick={() => { void Promise.all([limitQuery.refetch(), checkQuery.refetch()]); }}
            disabled={limitQuery.isFetching || checkQuery.isFetching}
            data-testid="recipient-check-load-retry"
          >
            {t('common.retry')}
          </Button>
        </div>
      ) : configReady ? (
      <div data-testid="recipient-check-config-content" className={cn('space-y-6', !moduleEnabled && 'pointer-events-none opacity-50')}>
        {/* 功能说明横幅 */}
        <div className="rounded-lg border border-blue-200 bg-blue-50 p-3 dark:border-blue-800 dark:bg-blue-950/30">
          <div className="flex items-center gap-2 text-sm text-blue-700 dark:text-blue-300">
            <Info className="h-4 w-4 flex-shrink-0" />
            <span>{t('recipientCheck.banner')}</span>
          </div>
        </div>

        {/* 数量限制策略 */}
        <div className="rounded-lg border">
          <div className="border-b bg-gray-50 p-4 dark:bg-gray-800/50">
            <div className="flex items-center gap-3">
              <Switch
                checked={limit.is_active}
                onCheckedChange={(v) => setLimit((l) => ({ ...l, is_active: v }))}
                aria-label={t('recipientCheck.limit.title')}
                data-testid="recipient-limit-switch"
              />
              <div>
                <h4 className="text-sm font-medium">{t('recipientCheck.limit.title')}</h4>
                <p className="mt-0.5 text-xs text-muted-foreground">{t('recipientCheck.limit.desc')}</p>
              </div>
            </div>
          </div>

          {limit.is_active && (
            <div className="space-y-4 p-4" data-testid="recipient-limit-config">
              <div className="space-y-3">
                <Label className="text-sm font-medium">{t('recipientCheck.limit.modeLabel')}</Label>
                <RadioGroup value={limit.mode} onValueChange={(v) => setLimit((l) => ({ ...l, mode: v as 'detailed' | 'merged' }))}>
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="detailed" id="rc-mode-detailed" data-testid="recipient-limit-mode-detailed" />
                    <Label htmlFor="rc-mode-detailed" className="cursor-pointer text-sm">{t('recipientCheck.limit.mode.detailed')}</Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="merged" id="rc-mode-merged" data-testid="recipient-limit-mode-merged" />
                    <Label htmlFor="rc-mode-merged" className="cursor-pointer text-sm">{t('recipientCheck.limit.mode.merged')}</Label>
                  </div>
                </RadioGroup>
              </div>

              {limit.mode === 'detailed' ? (
                <div className="space-y-4">
                  <DirectionCard
                    direction="inbound"
                    badgeLabel={t('recipientCheck.limit.direction.inbound')}
                    badgeClass={BADGE_INBOUND}
                    hint={t('recipientCheck.limit.hint.inbound')}
                    config={limit.inbound_limit!}
                    onChange={(n) => setLimit((l) => ({ ...l, inbound_limit: n }))}
                    showScope
                    t={t}
                  />
                  <DirectionCard
                    direction="outbound"
                    badgeLabel={t('recipientCheck.limit.direction.outbound')}
                    badgeClass={BADGE_OUTBOUND}
                    hint={t('recipientCheck.limit.hint.outbound')}
                    config={limit.outbound_limit!}
                    onChange={(n) => setLimit((l) => ({ ...l, outbound_limit: { limit: n.limit, action: n.action } }))}
                    t={t}
                  />
                  <DirectionCard
                    direction="internal"
                    badgeLabel={t('recipientCheck.limit.direction.internal')}
                    badgeClass={BADGE_INTERNAL}
                    hint={t('recipientCheck.limit.hint.internal')}
                    config={limit.internal_limit!}
                    onChange={(n) => setLimit((l) => ({ ...l, internal_limit: { limit: n.limit, action: n.action } }))}
                    t={t}
                  />
                </div>
              ) : (
                <div className="space-y-4">
                  <DirectionCard
                    direction="inbound"
                    badgeLabel={t('recipientCheck.limit.direction.inbound')}
                    badgeClass={BADGE_INBOUND}
                    hint={t('recipientCheck.limit.hint.inbound')}
                    config={limit.inbound_limit!}
                    onChange={(n) => setLimit((l) => ({ ...l, inbound_limit: n }))}
                    showScope
                    t={t}
                  />
                  <div data-testid="recipient-limit-card-merged" className="space-y-3 rounded-lg border border-gray-200 bg-gray-50 p-4 dark:border-gray-700 dark:bg-gray-900">
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className={BADGE_MERGED}>{t('recipientCheck.limit.mergedTitle')}</Badge>
                      <span className="text-xs text-muted-foreground">{t('recipientCheck.limit.hint.merged')}</span>
                    </div>
                    <div className="grid grid-cols-1 gap-4 min-[1366px]:grid-cols-2">
                      <div className="space-y-2">
                        <Label className="text-xs">{t('recipientCheck.limit.maxRecipients')}</Label>
                        <div className="flex items-center gap-2">
                          <Input
                            data-testid="recipient-limit-value-merged"
                            type="number"
                            value={limit.merged_limit!.limit}
                            onChange={(e) => setLimit((l) => ({ ...l, merged_limit: { ...l.merged_limit!, limit: parseInt(e.target.value) || 0 } }))}
                            className="w-20"
                            min={-1}
                            max={1000}
                          />
                          <span className="text-sm text-muted-foreground">{t('recipientCheck.limit.unit')}</span>
                        </div>
                      </div>
                      <div className="space-y-2">
                        <Label className="text-xs">{t('recipientCheck.limit.actionLabel')}</Label>
                        <Select
                          value={limit.merged_limit!.action}
                          onValueChange={(v) => setLimit((l) => ({ ...l, merged_limit: { ...l.merged_limit!, action: v as RecipientLimitAction } }))}
                        >
                          <SelectTrigger className="w-full" data-testid="recipient-limit-action-merged">
                            <SelectValue>{t(`recipientCheck.limit.action.${limit.merged_limit!.action}`)}</SelectValue>
                          </SelectTrigger>
                          <SelectContent>
                            {RECIPIENT_ACTIONS.map((a) => (
                              <SelectItem key={a} value={a} data-testid={`recipient-limit-action-merged-option-${a}`}>{t(`recipientCheck.limit.action.${a}`)}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                    <p className="text-xs text-muted-foreground">{t(`recipientCheck.limit.actionDesc.${limit.merged_limit!.action}`)}</p>
                    <div data-testid="recipient-limit-merged-note" className="flex items-start gap-2 rounded border border-amber-200 bg-amber-50 p-2 dark:border-amber-800 dark:bg-amber-950/30">
                      <Info className="mt-0.5 h-4 w-4 flex-shrink-0 text-amber-600 dark:text-amber-400" />
                      <p className="text-xs text-amber-700 dark:text-amber-300">{t('recipientCheck.limit.mergedNote')}</p>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* 存在性验证策略 */}
        <div className="rounded-lg border">
          <div className="border-b bg-gray-50 p-4 dark:bg-gray-800/50">
            <div className="flex items-center gap-3">
              <Switch
                checked={check.existence_enabled}
                onCheckedChange={(v) => setCheck((c) => ({ ...c, existence_enabled: v }))}
                aria-label={t('recipientCheck.existence.title')}
                data-testid="recipient-existence-switch"
              />
              <div>
                <h4 className="text-sm font-medium">{t('recipientCheck.existence.title')}</h4>
                <p className="mt-0.5 text-xs text-muted-foreground">{t('recipientCheck.existence.desc')}</p>
              </div>
            </div>
          </div>

          {check.existence_enabled && (
            <div className="space-y-4 p-4" data-testid="recipient-existence-config">
              {!ldapConnected && (
                <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 dark:border-amber-800 dark:bg-amber-950/30">
                  <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0 text-amber-600 dark:text-amber-400" />
                  <div>
                    <p className="text-sm font-medium text-amber-700 dark:text-amber-300">{t('recipientCheck.existence.offlineTitle')}</p>
                    <p className="mt-0.5 text-xs text-amber-600 dark:text-amber-400">{t('recipientCheck.existence.offlineDesc')}</p>
                    {/* GT-12157：带上具体原因，运维不必去翻日志猜是哪一种不可用。 */}
                    {directoryReason && (
                      <p className="mt-1 text-xs text-amber-600/80 dark:text-amber-400/80" data-testid="recipient-directory-reason">
                        {t(`recipientCheck.existence.offlineReason.${directoryReason}`)}
                      </p>
                    )}
                  </div>
                </div>
              )}

              <div className="flex items-start gap-2 rounded-lg border border-blue-200 bg-blue-50 p-3 dark:border-blue-800 dark:bg-blue-950/30">
                <Info className="mt-0.5 h-4 w-4 flex-shrink-0 text-blue-500" />
                <p className="text-sm text-blue-700 dark:text-blue-300">{t('recipientCheck.existence.directionNote')}</p>
              </div>

              <div className="space-y-3 rounded-lg border border-gray-200 bg-gray-50 p-4 dark:border-gray-700 dark:bg-gray-900">
                <h5 className="text-sm font-medium">{t('recipientCheck.existence.strictMode')}</h5>
                <div className="flex flex-wrap gap-2">
                  <Badge variant="secondary" className="text-xs">{t('recipientCheck.existence.badge.ldap')}</Badge>
                  <Badge variant="secondary" className="text-xs">{t('recipientCheck.existence.badge.api')}</Badge>
                  <Badge variant="secondary" className="text-xs">{t('recipientCheck.existence.badge.alias')}</Badge>
                </div>
                <div className="space-y-2">
                  <Label className="text-xs">{t('recipientCheck.existence.failActionLabel')}</Label>
                  <Select value={check.existence_action} onValueChange={(v) => setCheck((c) => ({ ...c, existence_action: v as RecipientLimitAction }))}>
                    <SelectTrigger className="w-[200px]" data-testid="recipient-existence-action">
                      <SelectValue>{t(`recipientCheck.limit.action.${check.existence_action}`)}</SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      {RECIPIENT_ACTIONS.map((a) => (
                        <SelectItem key={a} value={a} data-testid={`recipient-existence-action-option-${a}`}>{t(`recipientCheck.limit.action.${a}`)}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">{t(`recipientCheck.limit.actionDesc.${check.existence_action}`)}</p>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* 底部说明 */}
        <div className="flex items-start gap-2 rounded-lg border border-gray-200 bg-gray-50 p-3 dark:border-gray-700 dark:bg-gray-800/50">
          <Info className="mt-0.5 h-4 w-4 flex-shrink-0 text-muted-foreground" />
          <p className="text-xs text-muted-foreground">{t('recipientCheck.footerNote')}</p>
        </div>

      </div>
      ) : (
        <div className="py-12 text-center text-sm text-muted-foreground" data-testid="recipient-check-loading">
          {t('common.loading')}
        </div>
      )}

      {/* 此操作栏仅保存下方检测规则草稿；模块启用/禁用状态由 useModuleMaster 通过
          registry PUT 即时持久化，与本操作栏的保存/重置互不影响。 */}
      <div className="flex flex-wrap justify-end gap-2">
        <Button type="button" variant="outline" onClick={handleReset} disabled={!configReady || resetting} data-testid="recipient-check-reset">
          {t('behaviorControl.recipientLimit.reset')}
        </Button>
        <Button type="button" onClick={handleSave} disabled={!configReady || saving} data-testid="recipient-check-save">
          {t('common.save')}
        </Button>
      </div>
      </div>
      </PipelinePanelHeader>
    </div>
  );
}
