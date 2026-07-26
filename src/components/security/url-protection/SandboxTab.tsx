'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Globe, Database, Cloud } from 'lucide-react';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { FieldLabel } from './field-label';
import type {
  Direction,
  SandboxConfigMap,
  SandboxDirectionConfig,
  URLProtectionSettings,
} from '@/types/url-protection';

// demo createDefaultSandboxConfig("receive") 的默认值
const DEFAULT_SANDBOX: SandboxDirectionConfig = {
  enabled: true,
  malicious_action: 'isolate',
  timeout_action: 'continue',
  local_intel_enabled: true,
  intel_cleanup_days: 180,
  cloud_intel_enabled: true,
};

export function parseSandboxConfig(raw?: string | null): SandboxConfigMap {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw) as SandboxConfigMap;
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

interface Props {
  direction: Direction;
  settings: URLProtectionSettings | null;
  onPatch: (patch: Partial<URLProtectionSettings>) => void;
}

// html_spec §2.3 / layer-1/layer-2：URL沙箱检测 Tab（仅传统版形态渲染，GT 决策#1）。
// 纯配置面：写入 settings.sandbox_config JSON（本期不接检测引擎，Q6）。
export function SandboxTab({ direction, settings, onPatch }: Props) {
  const t = useTranslations('urlProtection.sandbox');
  const map = parseSandboxConfig(settings?.sandbox_config);
  const cfg: SandboxDirectionConfig = { ...DEFAULT_SANDBOX, ...(map[direction] ?? {}) };
  const [cleanupError, setCleanupError] = useState(false);

  const update = (patch: Partial<SandboxDirectionConfig>) => {
    const next: SandboxConfigMap = { ...map, [direction]: { ...cfg, ...patch } };
    onPatch({ sandbox_config: JSON.stringify(next) });
  };

  // demo 行为（layer-2 状态 2A）：onChange 即时校验，非法值不写入（受控组件自然回弹）+ 红框红字；
  // 空值同报错（D-004 随 demo，对 PRD「恢复180」为有意偏离）。
  const handleCleanupChange = (value: string) => {
    const num = parseInt(value, 10);
    if (Number.isNaN(num) || num < 30 || num > 365) {
      setCleanupError(true);
    } else {
      setCleanupError(false);
      update({ intel_cleanup_days: num });
    }
  };

  return (
    <div className="space-y-6" data-testid="sandbox-tab">
      {/* 沙箱检测开关卡（Globe 紫） */}
      <div className="space-y-4 p-4 bg-muted/40 rounded-lg border" data-testid="sandbox-toggle-card">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Globe className="h-5 w-5 text-purple-500" />
            <div>
              <FieldLabel tip={t('toggleTip')} testId="sandbox-toggle-tooltip-trigger">{t('toggle')}</FieldLabel>
              <p className="text-xs text-muted-foreground mt-0.5">{t('toggleDesc')}</p>
            </div>
          </div>
          <Switch
            checked={cfg.enabled}
            onCheckedChange={(v) => update({ enabled: v })}
            aria-label="sandbox-toggle"
            data-testid="sandbox-toggle"
          />
        </div>
      </div>

      {/* 检测结果处置 + 扫描异常处置：沙箱关 → 置灰（layer-2 状态 2C） */}
      <div className={cn('space-y-4', !cfg.enabled && 'opacity-50 pointer-events-none')} data-testid="sandbox-detect-zone">
        <div className="space-y-3">
          <Label className="font-medium">{t('detectGroup')}</Label>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <FieldLabel tip={t('maliciousTip')} testId="sandbox-malicious-tooltip-trigger" small>{t('maliciousLabel')}</FieldLabel>
              <Select
                value={cfg.malicious_action}
                onValueChange={(v) => update({ malicious_action: v as SandboxDirectionConfig['malicious_action'] })}
              >
                <SelectTrigger aria-label="sandbox-malicious-action" data-testid="sandbox-malicious-action-trigger"><SelectValue /></SelectTrigger>
                <SelectContent data-testid="sandbox-malicious-action-content">
                  <SelectItem value="isolate" title={t('actionIsolateTip')} data-testid="sandbox-malicious-action-isolate">{t('actionIsolate')}</SelectItem>
                  <SelectItem value="block" title={t('actionBlockTip')} data-testid="sandbox-malicious-action-block">{t('actionBlock')}</SelectItem>
                  <SelectItem value="mark" title={t('actionMarkTip')} data-testid="sandbox-malicious-action-mark">{t('actionMark')}</SelectItem>
                  <SelectItem value="discard" title={t('actionDiscardTip')} data-testid="sandbox-malicious-action-discard">{t('actionDiscard')}</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>

        <div className="space-y-3">
          <Label className="font-medium">{t('anomalyGroup')}</Label>
          <div className="space-y-2">
            <Label className="text-sm">{t('timeoutLabel')}</Label>
            <Select
              value={cfg.timeout_action}
              onValueChange={(v) => update({ timeout_action: v as SandboxDirectionConfig['timeout_action'] })}
            >
              <SelectTrigger className="w-full md:w-[300px]" aria-label="sandbox-timeout-action" data-testid="sandbox-timeout-action-trigger"><SelectValue /></SelectTrigger>
              <SelectContent data-testid="sandbox-timeout-action-content">
                <SelectItem value="continue" title={t('timeoutContinueTip')} data-testid="sandbox-timeout-action-continue">{t('timeoutContinue')}</SelectItem>
                <SelectItem value="treat_malicious" title={t('timeoutTreatMaliciousTip')} data-testid="sandbox-timeout-action-treat-malicious">{t('timeoutTreatMalicious')}</SelectItem>
                <SelectItem value="pass" data-testid="sandbox-timeout-action-pass">{t('timeoutPass')}</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      <div className="border-t" />

      {/* 情报库设置（Database 绿） */}
      <div className="space-y-4" data-testid="sandbox-intel-section">
        <div className="flex items-center gap-2">
          <Database className="h-5 w-5 text-green-500" />
          <Label className="font-medium text-base">{t('intelGroup')}</Label>
        </div>

        <div className="space-y-4 p-4 bg-muted/40 rounded-lg border" data-testid="sandbox-local-intel-card">
          <div className="flex items-center justify-between">
            <div>
              <FieldLabel tip={t('localIntelTip')} testId="sandbox-local-intel-tooltip-trigger">{t('localIntel')}</FieldLabel>
              <p className="text-xs text-muted-foreground mt-0.5">{t('localIntelDesc')}</p>
            </div>
            <Switch
              checked={cfg.local_intel_enabled}
              onCheckedChange={(v) => update({ local_intel_enabled: v })}
              aria-label="sandbox-local-intel"
              data-testid="sandbox-local-intel-toggle"
            />
          </div>
          {/* 清理周期块：条件渲染（关闭卸载、重开保留 —— layer-2 状态 2B） */}
          {cfg.local_intel_enabled && (
            <div className="space-y-2 pt-2 border-t" data-testid="sandbox-cleanup-zone">
              <FieldLabel tip={t('cleanupTip')} testId="sandbox-cleanup-tooltip-trigger" small>{t('cleanupLabel')}</FieldLabel>
              <div className="flex items-center gap-2">
                <Input
                  type="number"
                  value={cfg.intel_cleanup_days}
                  min={30}
                  max={365}
                  onChange={(e) => handleCleanupChange(e.target.value)}
                  className={cn('w-24', cleanupError && 'border-red-500')}
                  aria-label="sandbox-cleanup-days"
                  data-testid="sandbox-cleanup-days-input"
                />
                <span className="text-sm text-muted-foreground">{t('cleanupUnit')}</span>
              </div>
              {cleanupError && <p className="text-xs text-red-500" data-testid="sandbox-cleanup-error">{t('cleanupError')}</p>}
              <p className="text-xs text-muted-foreground">{t('cleanupHint')}</p>
            </div>
          )}
        </div>

        <div className="space-y-2 p-4 bg-muted/40 rounded-lg border" data-testid="sandbox-cloud-intel-card">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Cloud className="h-4 w-4 text-blue-500" />
              <div>
                <FieldLabel tip={t('cloudIntelTip')} testId="sandbox-cloud-intel-tooltip-trigger">{t('cloudIntel')}</FieldLabel>
                <p className="text-xs text-muted-foreground mt-0.5">{t('cloudIntelDesc')}</p>
              </div>
            </div>
            <Switch
              checked={cfg.cloud_intel_enabled}
              onCheckedChange={(v) => update({ cloud_intel_enabled: v })}
              aria-label="sandbox-cloud-intel"
              data-testid="sandbox-cloud-intel-toggle"
            />
          </div>
        </div>
      </div>
    </div>
  );
}
