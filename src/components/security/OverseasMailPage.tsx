'use client';

import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useApiRequest } from '@/lib/api/client';
import { getOverseasMailConfig, updateOverseasMailConfig } from '@/lib/api/overseas-mail';
import type { OverseasMailConfig, OverseasMailDirection, OverseasMailAction } from '@/types/overseas-mail';
import {
  OVERSEAS_MAIL_ACTION_NONE,
  OverseasMailActionLabels,
  defaultOverseasMailConfig,
  isOverseasBlockAllConfig,
  overseasMailDirectionView,
} from '@/types/overseas-mail';
import { ConfirmDialog } from '@/components/shared/confirm-dialog';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from '@/components/ui/table';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { PageHeader, PageShell } from '@/components/shared/page-shell';
import { useAuth } from '@/contexts/auth-context';
import { toast } from 'sonner';
import { Loader2, AlertTriangle, Info } from 'lucide-react';
import { cn } from '@/lib/utils';
import { ModuleMasterSwitch } from '@/components/security/ModuleMasterSwitch';
import { GeoIpLibraryTable } from '@/components/security/GeoIpLibraryTable';

const DIRECTIONS: { key: OverseasMailDirection; emoji: string; labelKey: string; descKey: string }[] = [
  { key: 'inbound', emoji: '📥', labelKey: 'overseasMail.directionInbound', descKey: 'overseasMail.directionInboundDesc' },
  { key: 'outbound', emoji: '📤', labelKey: 'overseasMail.directionOutbound', descKey: 'overseasMail.directionOutboundDesc' },
  { key: 'internal', emoji: '🔄', labelKey: 'overseasMail.directionInternal', descKey: 'overseasMail.directionInternalDesc' },
];

const ACTIONS: OverseasMailAction[] = ['accept', 'quarantine', 'audit', 'reject', 'discard'];

const ACTION_LABEL_KEYS = OverseasMailActionLabels;

const DEFAULT_CONFIG: OverseasMailConfig = defaultOverseasMailConfig();

// GT-12105：宿主（策略流水线抽屉 / 平台安全策略面板）需要感知未保存状态，
// 才能在切换策略或关闭时弹确认框。
export function OverseasMailPage({ embedded, onDirtyChange }: { embedded?: boolean; onDirtyChange?: (dirty: boolean) => void } = {}) {
  const t = useTranslations();
  const queryClient = useQueryClient();
  const { apiRequest } = useApiRequest();
  const { isSystemAdmin } = useAuth();

  const [localConfig, setLocalConfig] = useState<OverseasMailConfig>(DEFAULT_CONFIG);
  const [lastGoodConfig, setLastGoodConfig] = useState<OverseasMailConfig>(DEFAULT_CONFIG);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  // GT-12114 Q-10：乐观锁版本——GET/保存成功时更新，保存时回传。
  const [configVersion, setConfigVersion] = useState<string | undefined>(undefined);
  useEffect(() => { onDirtyChange?.(hasUnsavedChanges); }, [hasUnsavedChanges, onDirtyChange]);

  const { data: config, isLoading: configLoading } = useQuery({
    queryKey: ['overseas-mail-config'],
    queryFn: () => getOverseasMailConfig(apiRequest),
    enabled: embedded || isSystemAdmin,
  });

  useEffect(() => {
    if (config) {
      const cfg: OverseasMailConfig = { directions: config.directions };
      setLocalConfig(cfg);
      setLastGoodConfig(cfg);
      setConfigVersion(config.version);
      setHasUnsavedChanges(false);
    }
  }, [config]);

  const saveMutation = useMutation({
    mutationFn: async (data: OverseasMailConfig) => {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 10_000);
      try {
        return await updateOverseasMailConfig(data, apiRequest, controller.signal, configVersion);
      } finally {
        clearTimeout(timeout);
      }
    },
    onSuccess: (data) => {
      const cfg: OverseasMailConfig = { directions: data.directions };
      setLastGoodConfig(cfg);
      setLocalConfig(cfg);
      setConfigVersion(data.version);
      setHasUnsavedChanges(false);
      toast.success(t('common.saveSuccess'));
      queryClient.invalidateQueries({ queryKey: ['overseas-mail-config'] });
    },
    onError: (error: Error) => {
      // GT-12114 Q-10：版本冲突（另一管理员已改过）——提示刷新，
      // 并 invalidate 重拉服务端最新配置与版本。
      if ((error as { status?: number })?.status === 409) {
        toast.error(t('overseasMail.versionConflict'));
        queryClient.invalidateQueries({ queryKey: ['overseas-mail-config'] });
        return;
      }
      if (error.name === 'AbortError') {
        toast.error(t('overseasMail.saveTimeout'));
      } else {
        toast.error(t('overseasMail.saveFailed'));
      }
      setLocalConfig(lastGoodConfig);
      setHasUnsavedChanges(false);
    },
  });

  const handleToggleDirection = (dir: OverseasMailDirection, enabled: boolean) => {
    setLocalConfig((prev) => ({
      ...prev,
      directions: {
        ...prev.directions,
        [dir]: { ...prev.directions[dir], enabled },
      },
    }));
    setHasUnsavedChanges(true);
  };

  const handleActionChange = (dir: OverseasMailDirection, action: OverseasMailAction) => {
    setLocalConfig((prev) => ({
      ...prev,
      directions: {
        ...prev.directions,
        [dir]: { ...prev.directions[dir], action },
      },
    }));
    setHasUnsavedChanges(true);
  };

  const handleMarkChange = (dir: OverseasMailDirection, markEnabled: boolean) => {
    setLocalConfig((prev) => ({
      ...prev,
      directions: {
        ...prev.directions,
        [dir]: { ...prev.directions[dir], mark_enabled: markEnabled },
      },
    }));
    setHasUnsavedChanges(true);
  };

  // GT-12114 Q-04：全阻断配置弹窗提示并禁止保存（产品拍板文案见 i18n）。
  const [blockAllDialogOpen, setBlockAllDialogOpen] = useState(false);

  const handleSave = () => {
    if (isOverseasBlockAllConfig(localConfig)) {
      setBlockAllDialogOpen(true);
      return;
    }
    saveMutation.mutate(localConfig);
  };

  const enabledDirections = DIRECTIONS.filter(
    (d) => localConfig.directions[d.key]?.enabled,
  );
  const allDisabled = enabledDirections.length === 0;
  const internalEnabled = localConfig.directions.internal?.enabled;

  if (!embedded && !isSystemAdmin) {
    return (
      <PageShell>
        <PageHeader title={t('overseasMail.title')} />
        <div className="flex items-center justify-center py-20 text-muted-foreground">
          {t('common.notAuthorized')}
        </div>
      </PageShell>
    );
  }

  const summaryText = allDisabled
    ? t('overseasMail.summaryNone')
    : t('overseasMail.summary', {
        directions: enabledDirections.map((d) => t(d.labelKey)).join(', '),
      });

  const content = (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">{summaryText}</p>

      <div className="rounded-lg border overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/50 hover:bg-muted/50">
              <TableHead className="w-[220px]">{t('overseasMail.directionLabel')}</TableHead>
              <TableHead className="w-[100px] text-center">{t('overseasMail.toggleLabel')}</TableHead>
              <TableHead className="w-[200px]">{t('overseasMail.actionLabel')}</TableHead>
              <TableHead>{t('overseasMail.effectPreview')}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {DIRECTIONS.map((dir) => {
              const dirConfig = localConfig.directions[dir.key];
              const view = overseasMailDirectionView(dirConfig);
              return (
                <TableRow
                  key={dir.key}
                  data-testid={`direction-row-${dir.key}`}
                  data-enabled={dirConfig?.enabled ? 'true' : 'false'}
                  className={cn(view.muted && 'bg-muted/40 text-muted-foreground')}
                >
                  <TableCell className="whitespace-normal">
                    <div className="flex items-center gap-2">
                      <span className="text-base leading-none">{dir.emoji}</span>
                      <div>
                        <div className="text-sm font-medium">{t(dir.labelKey)}</div>
                        <div className="text-xs text-muted-foreground">{t(dir.descKey)}</div>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell className="text-center">
                    <Switch
                      checked={dirConfig?.enabled ?? false}
                      onCheckedChange={(v) => handleToggleDirection(dir.key, v)}
                    />
                  </TableCell>
                  <TableCell>
                    <Select
                      value={dirConfig?.action ?? DEFAULT_CONFIG.directions[dir.key].action}
                      onValueChange={(v) => handleActionChange(dir.key, v as OverseasMailAction)}
                      disabled={!view.actionEditable}
                    >
                      <SelectTrigger
                        className="w-full max-w-[180px]"
                        data-testid={`direction-action-${dir.key}`}
                      >
                        <SelectValue>
                          {view.actionEditable ? t(view.actionLabel) : OVERSEAS_MAIL_ACTION_NONE}
                        </SelectValue>
                      </SelectTrigger>
                      <SelectContent>
                        {ACTIONS.map((action) => (
                          <SelectItem key={action} value={action}>
                            <div className="flex items-center gap-2">
                              <span>{t(ACTION_LABEL_KEYS[action])}</span>
                              {(action === 'reject' || action === 'discard') && (
                                <TooltipProvider>
                                  <Tooltip>
                                    <TooltipTrigger render={<AlertTriangle className="h-3 w-3 text-amber-500" />} />
                                    <TooltipContent>{t('overseasMail.blockDropWarning')}</TooltipContent>
                                  </Tooltip>
                                </TooltipProvider>
                              )}
                            </div>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {view.actionEditable && dirConfig?.action === 'accept' && (
                      <label className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
                        <Checkbox
                          checked={!!dirConfig.mark_enabled}
                          onCheckedChange={(checked) => handleMarkChange(dir.key, checked === true)}
                        />
                        {t('overseasMail.actionTagDeliver')}
                      </label>
                    )}
                  </TableCell>
                  <TableCell className="whitespace-normal">
                    <span
                      className={cn('text-xs text-muted-foreground', view.muted && 'italic')}
                      data-testid={`direction-effect-${dir.key}`}
                    >
                      {view.actionEditable
                        ? t('overseasMail.effectWhenHit', { action: t(view.actionLabel) })
                        : t(view.effectKey)}
                    </span>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      {internalEnabled && (
        <Alert className="border-amber-300 bg-amber-50 dark:bg-amber-950/20">
          <AlertTriangle className="h-4 w-4 text-amber-600" />
          <AlertDescription className="text-amber-800 dark:text-amber-200">
            {t('overseasMail.internalWarning')}
          </AlertDescription>
        </Alert>
      )}

      {allDisabled && !internalEnabled && (
        <Alert className="border-blue-300 bg-blue-50 dark:bg-blue-950/20">
          <Info className="h-4 w-4 text-blue-600" />
          <AlertDescription className="text-blue-800 dark:text-blue-200">
            {t('overseasMail.allDisabledInfo')}
          </AlertDescription>
        </Alert>
      )}

      <Alert className="border-gray-200 bg-gray-50 dark:bg-gray-900/20">
        <Info className="h-4 w-4 text-gray-500" />
        <AlertDescription className="text-gray-700 dark:text-gray-300 text-xs">
          {t('overseasMail.directionsInfo')}
        </AlertDescription>
      </Alert>

      <div className="border-t pt-4">
        <GeoIpLibraryTable />
      </div>

      {configLoading && (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="h-6 w-6 animate-spin" />
        </div>
      )}

      <ConfirmDialog
        open={blockAllDialogOpen}
        onOpenChange={setBlockAllDialogOpen}
        title={t('overseasMail.blockAllTitle')}
        description={t('overseasMail.blockAllMessage')}
        onConfirm={() => setBlockAllDialogOpen(false)}
      />

      {hasUnsavedChanges && (
        <div
          data-testid="overseas-unsaved-bar"
          className="sticky bottom-0 z-10 -mx-4 mt-2 flex items-center justify-between border-t bg-background/95 px-4 py-3 shadow-[0_-4px_12px_rgba(0,0,0,0.05)] backdrop-blur supports-[backdrop-filter]:bg-background/85"
        >
          <div className="flex items-center gap-2 text-amber-600 dark:text-amber-400">
            <span className="h-2 w-2 rounded-full bg-amber-500 animate-pulse" />
            <span className="text-sm">{t('overseasMail.unsavedChangesBanner')}</span>
          </div>
          <Button size="sm" onClick={handleSave} disabled={saveMutation.isPending}>
            {saveMutation.isPending && <Loader2 className="h-4 w-4 animate-spin mr-1" />}
            {t('common.save')}
          </Button>
        </div>
      )}
    </div>
  );

  if (embedded) {
    return <ModuleMasterSwitch page="overseas_mail">{content}</ModuleMasterSwitch>;
  }

  return (
    <PageShell>
      <PageHeader title={t('overseasMail.title')} />
      <ModuleMasterSwitch page="overseas_mail">{content}</ModuleMasterSwitch>
    </PageShell>
  );
}
