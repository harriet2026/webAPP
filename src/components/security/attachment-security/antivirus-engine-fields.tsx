'use client';

import { useCallback, useEffect, useState } from 'react';
import { CheckCircle2, Clock, Info, Loader2, RefreshCw, XCircle } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useApiRequest } from '@/lib/api/client';
import { getAntivirusStatus, triggerAntivirusUpdate } from '@/lib/api/attachment-security';
import type { AntivirusConfig, AVStatusResponse } from '@/types/attachment-security';

/**
 * 反病毒引擎「平台级」子段（GT：反病毒引擎配置归平台安全策略）
 *
 * 从 AntivirusTab 抽取的两个纯展示子组件，供两处复用：
 *  - 单租户形态：附件安全检测 → 反病毒页签（沿用原位置）
 *  - 多租户形态：平台安全策略 → 反病毒引擎 tab（唯一入口）
 *
 * 均使用 `attachmentSecurity` 命名空间，复用现有 `antivirus.*` 文案与 testid，
 * 不新增/修改后端契约。
 */

function infoLabel(label: string, tip: string, testId: string) {
  return (
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
}

interface AntivirusServerFieldsProps {
  config: AntivirusConfig;
  onChange: (config: AntivirusConfig) => void;
}

/** 反病毒服务器 host/port 配置（平台级）。 */
export function AntivirusServerFields({ config, onChange }: AntivirusServerFieldsProps) {
  const t = useTranslations('attachmentSecurity');
  return (
    <section className="space-y-4" data-testid="antivirus-server-fields">
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
  );
}

/** 病毒库状态 + 立即更新（平台级，自带状态加载与触发逻辑）。 */
export function AntivirusStatusSection() {
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

  return (
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
  );
}
