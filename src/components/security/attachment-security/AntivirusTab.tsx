'use client';

import { Info } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { AntivirusServerFields, AntivirusStatusSection } from './antivirus-engine-fields';
import type { AttachmentAction, AntivirusActionConfig, AntivirusConfig, Direction } from '@/types/attachment-security';

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
  /**
   * 多租户形态下隐藏平台级两段（服务器配置 + 病毒库状态/立即更新），
   * 仅保留租户级处置动作，并在顶部提示引导至平台安全策略。
   * 反病毒服务器与病毒库此时由平台管理员在「平台安全策略 → 反病毒引擎」统一配置。
   */
  hidePlatformConfig?: boolean;
}

export function AntivirusTab({
  direction = 'receive',
  config,
  actions,
  onChange,
  onActionsChange,
  hidePlatformConfig = false,
}: AntivirusTabProps) {
  const t = useTranslations('attachmentSecurity');

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
      {!hidePlatformConfig && (
        <>
          <AntivirusServerFields config={config} onChange={onChange} />
          <AntivirusStatusSection />
        </>
      )}

      <section className="space-y-4 rounded-lg border border-border/70 bg-muted/30 p-4">
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>{infoLabel(t('antivirus.virusAction'), t('tooltips.virusAction'), 'antivirus-virus-action')}</Label>
            <Select
              value={actions.virus_action}
              onValueChange={(action) => onActionsChange({ ...actions, virus_action: action as AntivirusActionConfig['virus_action'] })}
            >
              <SelectTrigger className="w-[280px] max-w-full" data-testid="antivirus-virus-action"><SelectValue>{t(`actions.${actions.virus_action}`)}</SelectValue></SelectTrigger>
              <SelectContent data-testid="antivirus-virus-action-options">
                {VIRUS_ACTIONS.map((action) => (
                  <SelectItem key={action} value={action} textValue={t(`actions.${action}`)} data-testid={`antivirus-virus-action-${action}`}>
                    <span className="flex flex-col gap-0.5">
                      <span>{t(`actions.${action}`)}</span>
                      <span className="text-xs text-muted-foreground">{t(`actionDesc.${action}` as `actionDesc.quarantine`)}</span>
                    </span>
                  </SelectItem>
                ))}
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
              <SelectTrigger className="w-[280px] max-w-full" data-testid="antivirus-timeout-action"><SelectValue>{t(`actions.${actions.timeout_action}`)}</SelectValue></SelectTrigger>
              <SelectContent data-testid="antivirus-timeout-action-options">
                {TIMEOUT_ACTIONS.map((action) => (
                  <SelectItem key={action} value={action} textValue={t(`actions.${action}`)} data-testid={`antivirus-timeout-action-${action}`}>
                    <span className="flex flex-col gap-0.5">
                      <span>{t(`actions.${action}`)}</span>
                      <span className="text-xs text-muted-foreground">{t(`actionDesc.${action}` as `actionDesc.quarantine`)}</span>
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </section>
    </div>
  );
}
