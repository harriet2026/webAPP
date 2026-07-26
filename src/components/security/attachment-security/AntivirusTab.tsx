'use client';

import { useCallback, useEffect, useState } from 'react';
import { CheckCircle2, Clock, Info, Loader2, RefreshCw, XCircle } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useApiRequest } from '@/lib/api/client';
import { getAntivirusStatus, triggerAntivirusUpdate } from '@/lib/api/attachment-security';
import type { AttachmentAction, AntivirusActionConfig, AntivirusConfig, AVStatusResponse, Direction } from '@/types/attachment-security';

export const DEFAULT_ANTIVIRUS_CONFIG: AntivirusConfig = { host: '', port: '' };
export const DEFAULT_ANTIVIRUS_ACTIONS: AntivirusActionConfig = {
  virus_action: 'quarantine',
  timeout_action: 'accept',
};

const VIRUS_ACTIONS: AttachmentAction[] = ['quarantine', 'audit', 'reject', 'discard'];
const TIMEOUT_ACTIONS: AttachmentAction[] = ['quarantine', 'audit', 'reject', 'discard', 'accept'];

interface AntivirusTabProps {
  direction?: Direction;
  config: AntivirusConfig;
  actions: AntivirusActionConfig;
  onChange: (config: AntivirusConfig) => void;
  onActionsChange: (config: AntivirusActionConfig) => void;
}

export function AntivirusTab({
  direction = 'receive',
  config,
  actions,
  onChange,
  onActionsChange,
}: AntivirusTabProps) {
  const t = useTranslations('attachmentSecurity');
  const { apiRequest } = useApiRequest();
  const [status, setStatus] = useState<AVStatusResponse | null>(null);
  const [statusLoading, setStatusLoading] = useState(true);
  const [updating, setUpdating] = useState(false);

  const loadStatus = useCallback(async () => {
    setStatusLoading(true);
    setStatus(await getAntivirusStatus(apiRequest));
    setStatusLoading(false);
  }, [apiRequest]);

  useEffect(() => {
    loadStatus();
  }, [loadStatus]);

  const updateVirusDatabase = async () => {
    setUpdating(true);
    try {
      await triggerAntivirusUpdate(apiRequest);
      toast.success(t('antivirus.updateSuccess'));
      await loadStatus();
    } catch {
      toast.error(t('antivirus.updateFailed'));
    } finally {
      setUpdating(false);
    }
  };

  const infoLabel = (label: string, tip: string, testId: string) => (
    <span className="flex items-center gap-1.5">
      {label}
      <Tooltip>
        <TooltipTrigger render={<button type="button" className="text-muted-foreground" aria-label={tip} data-testid={`${testId}-help`} />}>
          <Info className="h-3.5 w-3.5" />
        </TooltipTrigger>
        <TooltipContent className="max-w-[280px] text-xs" data-testid={`${testId}-tooltip`}>{tip}</TooltipContent>
      </Tooltip>
    </span>
  );

  return (
    <div className="space-y-6" data-testid="antivirus-tab" data-direction={direction}>
      <section className="space-y-4">
        <Label className="font-medium">{t('antivirus.serverConfig')}</Label>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="antivirus-host">{infoLabel(t('antivirus.antivirusServerHost'), t('tooltips.antivirusHost'), 'antivirus-host')}</Label>
            <Input
              id="antivirus-host"
              value={config.host}
              onChange={(event) => onChange({ ...config, host: event.target.value })}
              placeholder="av-server"
              data-testid="antivirus-host"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="antivirus-port">{t('antivirus.antivirusServerPort')}</Label>
            <Input
              id="antivirus-port"
              value={config.port}
              onChange={(event) => onChange({ ...config, port: event.target.value })}
              placeholder="6600"
              className="max-w-[220px]"
              data-testid="antivirus-port"
            />
          </div>
        </div>
      </section>

      <section className="space-y-4 rounded-lg border border-border/70 bg-muted/30 p-4" data-testid="antivirus-status-section">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="space-y-1">
            <Label className="font-medium">{t('antivirus.virusDbStatus')}</Label>
            <p className="text-xs text-muted-foreground">{t('antivirus.actualCapabilityHint')}</p>
          </div>
          <Button variant="outline" size="sm" onClick={updateVirusDatabase} disabled={updating} data-testid="antivirus-update-now">
            {updating ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="mr-1.5 h-3.5 w-3.5" />}
            {t('antivirus.updateNow')}
          </Button>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          {statusLoading ? (
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          ) : status?.configured ? (
            <Badge className="gap-1 bg-success/15 text-success hover:bg-success/15" data-testid="av-status-configured">
              <CheckCircle2 className="h-3.5 w-3.5" />
              {t('antivirus.configured')}
            </Badge>
          ) : (
            <Badge variant="secondary" className="gap-1" data-testid="av-status-not-configured">
              <XCircle className="h-3.5 w-3.5" />
              {t('antivirus.notConfigured')}
            </Badge>
          )}
          <span className="flex items-center gap-1.5 text-sm text-muted-foreground">
            <Clock className="h-3.5 w-3.5" />
            {t('antivirus.autoUpdate')}：{t('antivirus.daily')}
          </span>
        </div>
      </section>

      <section className="space-y-4 rounded-lg border border-border/70 bg-muted/30 p-4">
        <Label className="font-medium">{t('antivirus.actionConfig')}</Label>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>{infoLabel(t('antivirus.virusAction'), t('tooltips.virusAction'), 'antivirus-virus-action')}</Label>
            <Select
              value={actions.virus_action}
              onValueChange={(action) => onActionsChange({ ...actions, virus_action: action as AntivirusActionConfig['virus_action'] })}
            >
              <SelectTrigger className="w-[280px] max-w-full" data-testid="antivirus-virus-action"><SelectValue /></SelectTrigger>
              <SelectContent data-testid="antivirus-virus-action-options">
                {VIRUS_ACTIONS.map((action) => <SelectItem key={action} value={action} data-testid={`antivirus-virus-action-${action}`}>{t(`actions.${action}`)}</SelectItem>)}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">{t('antivirus.receiveDefault')}</p>
          </div>
          <div className="space-y-2">
            <Label>{infoLabel(t('antivirus.timeoutAction'), t('tooltips.antivirusTimeout'), 'antivirus-timeout-action')}</Label>
            <Select
              value={actions.timeout_action}
              onValueChange={(action) => onActionsChange({ ...actions, timeout_action: action as AntivirusActionConfig['timeout_action'] })}
            >
              <SelectTrigger className="w-[280px] max-w-full" data-testid="antivirus-timeout-action"><SelectValue /></SelectTrigger>
              <SelectContent data-testid="antivirus-timeout-action-options">
                {TIMEOUT_ACTIONS.map((action) => <SelectItem key={action} value={action} data-testid={`antivirus-timeout-action-${action}`}>{t(`actions.${action}`)}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>
      </section>
    </div>
  );
}
