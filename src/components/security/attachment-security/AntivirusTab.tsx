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

const VIRUS_ACTIONS: AttachmentAction[] = ['quarantine', 'audit', 'discard'];
const TIMEOUT_ACTIONS: AttachmentAction[] = ['quarantine', 'reject', 'discard', 'accept'];

// GT-12818：「拒收」已从「发现病毒后的处置」的新建选项中下线（VIRUS_ACTIONS 不含它），
// 但**后端仍接受并照常执行存量的 reject 配置**——产品裁决是「只是新建不给选，存量继续
// 生效」。若不做任何处理，存量租户会看到触发器上写着「拒收」、下拉里却找不到这一项，
// 无从确认自己当前究竟是什么行为。这里把这类已下线但仍生效的值补成一个**禁用项**：
// 看得见、选不中、也改不回去。timeout_action 的下拉未做此调整，因为它的 reject 没下线。
function retiredVirusActions(current: string): string[] {
  return VIRUS_ACTIONS.includes(current as AttachmentAction) ? [] : [current];
}

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
                  <SelectItem key={action} value={action} data-testid={`antivirus-virus-action-${action}`}>
                    <span className="flex flex-col gap-0.5">
                      <span>{t(`actions.${action}`)}</span>
                      <span className="text-xs text-muted-foreground">{t(`actionDesc.${action}` as `actionDesc.quarantine`)}</span>
                    </span>
                  </SelectItem>
                ))}
                {retiredVirusActions(actions.virus_action).map((action) => (
                  <SelectItem key={action} value={action} disabled data-testid={`antivirus-virus-action-${action}`}>
                    <span className="flex flex-col gap-0.5">
                      <span>{t(`actions.${action}` as `actions.quarantine`)}</span>
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
                  <SelectItem key={action} value={action} data-testid={`antivirus-timeout-action-${action}`}>
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
