'use client';

import { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, Info, Loader2 } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useApiRequest } from '@/lib/api/client';
import { getBasicLimitConfig } from '@/lib/api/attachment-security';
import { isValidLimitValue } from './limit-value';
import { cn } from '@/lib/utils';
import type { AttachmentAction, BasicLimitConfig, Direction } from '@/types/attachment-security';

export const DEFAULT_BASIC_LIMIT_CONFIG: BasicLimitConfig = {
  attachment_count_max: 10,
  attachment_size_max_kb: 10240,
  nested_zip_count_max: 2,
  nested_file_count_max: 20,
  nested_level_max: 2,
  scan_timeout_sec: 30,
  exceed_action: 'quarantine',
  partial_skip: false,
  danger_ext_enabled: true,
  danger_ext_list: '.exe,.scr,.com,.bat,.cmd,.pif,.vbs,.js,.jse,.ws,.wsh,.hta,.lnk,.iso,.img,.vhd,.ps1,.psm1,.msi',
  mime_mismatch_check: true,
};

const EXCEED_ACTIONS: AttachmentAction[] = [
  'quarantine',
  'audit',
  'reject',
  'discard',
  'partial_skip',
];

interface BasicLimitTabProps {
  direction?: Direction;
  config?: BasicLimitConfig;
  onChange?: (config: BasicLimitConfig) => void;
}

function mergeConfig(config: BasicLimitConfig | null): BasicLimitConfig {
  return { ...DEFAULT_BASIC_LIMIT_CONFIG, ...(config ?? {}) };
}

export function BasicLimitTab({ direction = 'receive', config, onChange }: BasicLimitTabProps) {
  const t = useTranslations('attachmentSecurity');
  const { apiRequest } = useApiRequest();
  const controlled = config !== undefined && onChange !== undefined;
  const [localConfig, setLocalConfig] = useState(DEFAULT_BASIC_LIMIT_CONFIG);
  const [loading, setLoading] = useState(!controlled);
  const value = controlled ? config : localConfig;

  useEffect(() => {
    if (controlled) return;
    let active = true;
    setLoading(true);
    getBasicLimitConfig(direction, apiRequest)
      .then((loaded) => {
        if (active) setLocalConfig(mergeConfig(loaded));
      })
      .catch(() => {
        if (active) setLocalConfig(DEFAULT_BASIC_LIMIT_CONFIG);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [apiRequest, controlled, direction]);

  const update = useCallback((updates: Partial<BasicLimitConfig>) => {
    const next = { ...value, ...updates };
    if (controlled) onChange(next);
    else setLocalConfig(next);
  }, [controlled, onChange, value]);

  // GT-12198: 数量上限只允许 -1（不限制）或正整数；0 等非法值必须给出字段错误并
  // 阻止保存，而不是仅靠 onBlur 静默 clamp（blur 未触发时非法值仍会被提交）。
  //
  // GT-12198 修复回归：此前用 type="number" + 每次 onChange 做 Number() 强转。
  // 浏览器对 <input type="number"> 在内容不完整（如刚敲下 "-"）时 .value 返回 ""，
  // Number("") === 0 会把草稿改写成 0，受控重渲染又把用户敲的 "-" 顶掉 ——
  // 结果是 -1 根本打不出来。改为保留字符串草稿、仅在可解析时回写数值。
  const [countDraft, setCountDraft] = useState<string>(String(value.attachment_count_max));
  // 外部值变化（加载配置/切换方向/重置）时同步草稿；正在输入的中间态不会触发，
  // 因为中间态不会回写 value。
  useEffect(() => {
    setCountDraft((prev) => (Number(prev) === value.attachment_count_max ? prev : String(value.attachment_count_max)));
  }, [value.attachment_count_max]);

  const attachmentCountInvalid = !isValidLimitValue(countDraft.trim(), true);

  const clamp = (key: keyof BasicLimitConfig, allowUnlimited = false) => {
    const raw = Number(value[key]);
    const next = allowUnlimited && raw === -1 ? -1 : Math.max(1, Number.isFinite(raw) ? Math.trunc(raw) : 1);
    if (next !== raw) update({ [key]: next });
  };

  const formatSize = (kb: number) => {
    if (kb === -1) return t('basicLimit.unlimited');
    if (kb < 1024) return `${kb} KB`;
    return `${(kb / 1024).toFixed(1)} MB`;
  };

  const fieldLabel = (label: string, tip: string, testId: string) => (
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

  if (loading) {
    return <div className="flex justify-center py-12"><Loader2 className="h-7 w-7 animate-spin" /></div>;
  }

  return (
    <div className="space-y-6" data-testid="basic-limit-tab">
      <section className="space-y-4">
        <Label className="font-medium">
          {t('basicLimit.attachmentStructure')}（{t('basicLimit.currentDirection')}：{t('direction.receiveFull')}）
        </Label>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="attachment-count-max">
              {fieldLabel(t('basicLimit.attachmentCountMax'), t('tooltips.attachmentCount'), 'attachment-count-max')}
            </Label>
            <div className="flex flex-wrap items-center gap-2">
              <Input
                id="attachment-count-max"
                type="text"
                inputMode="numeric"
                value={countDraft}
                onChange={(event) => {
                  const raw = event.target.value;
                  setCountDraft(raw);
                  // 仅在可解析为有限数值时回写；"" / "-" 等中间态保留在草稿里，
                  // 不写回 value，避免受控重渲染顶掉用户输入。
                  const n = Number(raw.trim());
                  if (raw.trim() !== '' && raw.trim() !== '-' && Number.isFinite(n)) {
                    update({ attachment_count_max: n });
                  }
                }}
                className={cn(
                  'w-24',
                  attachmentCountInvalid && 'border-destructive focus-visible:ring-destructive',
                  !attachmentCountInvalid && countDraft.trim() === '-1' && 'border-warning bg-warning/10',
                )}
                data-testid="attachment-count-max"
              />
              <span className="text-sm text-muted-foreground">{t('basicLimit.items')} {t('basicLimit.unlimitedHint')}</span>
            </div>
            {/* GT-12198: 非法值（0、负数、小数）给出字段错误并阻止保存，
                不再靠 onBlur 静默改成 1 —— 静默 clamp 会让错误永远不可见。 */}
            {attachmentCountInvalid && (
              <div className="flex items-center gap-1 text-xs text-destructive" data-testid="attachment-count-error">
                <AlertTriangle className="h-3.5 w-3.5" />
                {t('basicLimit.countInvalid')}
              </div>
            )}
            {!attachmentCountInvalid && countDraft.trim() === '-1' && (
              <div className="flex items-center gap-1 text-xs text-warning" data-testid="attachment-unlimited-warning">
                <AlertTriangle className="h-3.5 w-3.5" />
                {t('basicLimit.unlimitedWarning')}
              </div>
            )}
          </div>
          <div className="space-y-2">
            <Label htmlFor="attachment-size-max">
              {fieldLabel(t('basicLimit.attachmentSizeMaxKb'), t('tooltips.attachmentSize'), 'attachment-size-max-kb')}
            </Label>
            <div className="flex flex-wrap items-center gap-2">
              <Input
                id="attachment-size-max"
                type="number"
                value={value.attachment_size_max_kb}
                onChange={(event) => update({ attachment_size_max_kb: Number(event.target.value) })}
                onBlur={() => clamp('attachment_size_max_kb', true)}
                className={cn('w-28', value.attachment_size_max_kb === -1 && 'border-warning bg-warning/10')}
                data-testid="attachment-size-max-kb"
              />
              <span className="text-sm text-muted-foreground">KB（≈ {formatSize(value.attachment_size_max_kb)}）</span>
            </div>
          </div>
        </div>
      </section>

      <section className="space-y-4 rounded-lg border border-border/70 bg-muted/30 p-4" data-testid="nested-protection-section">
        <Label className="font-medium">{fieldLabel(t('basicLimit.nestedProtection'), t('tooltips.nestedProtection'), 'nested-protection')}</Label>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {([
            ['nested_zip_count_max', t('basicLimit.nestedZipCountMax'), t('basicLimit.items')],
            ['nested_file_count_max', t('basicLimit.nestedFileCountMax'), t('basicLimit.items')],
            ['nested_level_max', t('basicLimit.nestedLevelMax'), t('basicLimit.levels')],
          ] as const).map(([key, label, unit]) => (
            <div key={key} className="space-y-2">
              <Label htmlFor={key}>{label}</Label>
              <div className="flex items-center gap-2">
                <Input
                  id={key}
                  type="number"
                  min={1}
                  value={value[key]}
                  onChange={(event) => update({ [key]: Number(event.target.value) })}
                  onBlur={() => clamp(key)}
                  className="w-20"
                  data-testid={key.replaceAll('_', '-')}
                />
                <span className="text-sm text-muted-foreground">{unit}</span>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="space-y-3">
        <Label className="font-medium">{t('basicLimit.performanceProtection')}</Label>
        <div className="flex flex-wrap items-center gap-2">
          <Label htmlFor="scan-timeout">{fieldLabel(t('basicLimit.scanTimeoutSec'), t('tooltips.scanTimeout'), 'scan-timeout-sec')}</Label>
          <Input
            id="scan-timeout"
            type="number"
            min={1}
            value={value.scan_timeout_sec}
            onChange={(event) => update({ scan_timeout_sec: Number(event.target.value) })}
            onBlur={() => clamp('scan_timeout_sec')}
            className="w-20"
            data-testid="scan-timeout-sec"
          />
          <span className="text-sm text-muted-foreground">{t('basicLimit.seconds')}</span>
        </div>
      </section>

      <section className="space-y-3">
        <Label>{fieldLabel(t('basicLimit.exceedAction'), t('tooltips.exceedAction'), 'basic-limit-exceed-action')}</Label>
        <Select value={value.exceed_action} onValueChange={(action) => update({ exceed_action: action as AttachmentAction })}>
          <SelectTrigger className="w-[280px] max-w-full" data-testid="basic-limit-exceed-action">
            <SelectValue />
          </SelectTrigger>
          <SelectContent data-testid="basic-limit-exceed-action-options">
            {EXCEED_ACTIONS.map((action) => (
              <SelectItem key={action} value={action} data-testid={`basic-limit-exceed-action-${action}`}>{t(`actions.${action}`)}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="text-xs text-muted-foreground">{t('basicLimit.receiveDefault')}</p>
      </section>

    </div>
  );
}
