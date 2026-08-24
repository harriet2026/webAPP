'use client';

import { Info } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import type {
  AttachmentAction,
  Direction,
  ImageDetectActionConfig,
  ImageDetectConfig,
  QrDeepRoutesConfig,
} from '@/types/attachment-security';

export const DEFAULT_IMAGE_DETECT_CONFIG: ImageDetectConfig = {
  ocr_mode: 'light',
  ocr_max_count: 2,
  qr_mode: 'light',
  qr_max_count: 5,
};

export const DEFAULT_QR_DEEP_ROUTES: QrDeepRoutesConfig = {
  url_check: true,
  url_unshorten: true,
  keyword_filter: true,
  keyword_scope_url: true,
  keyword_scope_text: true,
  intent_engine: true,
  intent_high: true,
  intent_medium: true,
  intent_low: true,
  advanced_rules: false,
};

export const DEFAULT_IMAGE_DETECT_ACTIONS: ImageDetectActionConfig = {
  qr_light_action: 'quarantine',
  qr_deep_exceed_action: 'proceed',
  qr_deep_exceed_warn: true,
};

const LIGHT_ACTIONS: AttachmentAction[] = ['quarantine', 'audit', 'discard'];

interface ImageDetectTabProps {
  direction?: Direction;
  config: ImageDetectConfig;
  routes: QrDeepRoutesConfig;
  actions: ImageDetectActionConfig;
  onChange: (config: ImageDetectConfig) => void;
  onRoutesChange: (config: QrDeepRoutesConfig) => void;
  onActionsChange: (config: ImageDetectActionConfig) => void;
}

export function ImageDetectTab({
  direction = 'receive',
  config,
  routes,
  actions,
  onChange,
  onRoutesChange,
  onActionsChange,
}: ImageDetectTabProps) {
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

  const clampOcr = () => {
    const next = Math.max(1, Number.isFinite(config.ocr_max_count) ? Math.trunc(config.ocr_max_count) : 1);
    if (next !== config.ocr_max_count) onChange({ ...config, ocr_max_count: next });
  };

  // GT-12xxx：检测模式为「不检测」时，「检测数量上限」不生效，禁用输入。
  const ocrDisabled = config.ocr_mode === 'none';

  const setQrLimit = (raw: number) => {
    const next = Math.min(50, Math.max(1, Number.isFinite(raw) ? Math.trunc(raw) : 1));
    onChange({ ...config, qr_max_count: next });
  };

  return (
    <div className="space-y-6" data-testid="image-detect-tab" data-direction={direction}>
      <section className="space-y-4">
        <Label className="font-medium">{t('imageDetect.ocrDetection')}</Label>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <Label>{infoLabel(t('imageDetect.detectionMode'), t('tooltips.ocrMode'), 'ocr-detection-mode')}</Label>
            <Select value={config.ocr_mode} onValueChange={(mode) => onChange({ ...config, ocr_mode: mode as ImageDetectConfig['ocr_mode'] })}>
              <SelectTrigger className="w-full max-w-[400px]" data-testid="ocr-detection-mode"><SelectValue /></SelectTrigger>
              <SelectContent className="min-w-[var(--radix-select-trigger-width)] w-max" data-testid="ocr-detection-mode-options">
                <SelectItem value="none" data-testid="ocr-detection-mode-none">{t('imageDetect.ocrMode_none')}</SelectItem>
                {/* GT-12xxx：OCR 仅单一 pytesseract 路径，无深浅之分，
                    原「深度检测（手写+印刷）」为从未实现的禁用占位，已移除；
                    「轻度检测（仅印刷体）」即唯一检测模式，文案精简为「检测」。 */}
                <SelectItem value="light" data-testid="ocr-detection-mode-light">{t('imageDetect.ocrMode_light')}</SelectItem>
                {/* GT-12753：原型移除「深度」OCR 选项（GT-12720 曾按原型恢复可选，
                    但后端始终未区分深浅 —— runOCR 的 mode 只用于打日志，pyhelper
                    /v1/ocr 只有单一 pytesseract 路径，选「深度」与「轻度」执行完全
                    一致。产品决策改为不提供该档位；后端 ocr_mode 校验仍接受 deep
                    以兼容存量配置。 */}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="ocr-limit">{t('imageDetect.ocrLimit')}</Label>
            <div className="flex items-center gap-2">
              <Input
                id="ocr-limit"
                type="number"
                min={1}
                value={config.ocr_max_count}
                onChange={(event) => onChange({ ...config, ocr_max_count: Number(event.target.value) })}
                onBlur={clampOcr}
                disabled={ocrDisabled}
                className="w-20"
                data-testid="ocr-max-count"
              />
              <span className="text-sm text-muted-foreground">{t('imageDetect.attachments')}</span>
            </div>
            {/* GT-12xxx：检测模式为「不检测」时不执行 OCR，「检测数量上限」无意义，禁用并提示。 */}
            {ocrDisabled ? (
              <p className="text-xs text-muted-foreground" data-testid="ocr-max-count-disabled-hint">
                {t('imageDetect.ocrLimitDisabledHint')}
              </p>
            ) : null}
          </div>
        </div>
      </section>

      <section className="space-y-4 rounded-lg border border-border/70 bg-muted/30 p-4">
        <Label className="font-medium">{t('imageDetect.qrDetection')}</Label>
        <div className="space-y-2">
          <Label>{infoLabel(t('imageDetect.detectionMode'), t('tooltips.qrMode'), 'qr-detection-mode')}</Label>
          <Select value={config.qr_mode} onValueChange={(mode) => onChange({ ...config, qr_mode: mode as ImageDetectConfig['qr_mode'] })}>
            <SelectTrigger className="w-[400px] max-w-full" data-testid="qr-detection-mode"><SelectValue /></SelectTrigger>
            <SelectContent data-testid="qr-detection-mode-options">
              <SelectItem value="none" data-testid="qr-detection-mode-none">{t('imageDetect.qrMode_none')}</SelectItem>
              <SelectItem value="light" data-testid="qr-detection-mode-light">{t('imageDetect.qrMode_light')}</SelectItem>
              <SelectItem value="deep" data-testid="qr-detection-mode-deep">{t('imageDetect.qrMode_deep')}</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {config.qr_mode === 'light' && (
          <div className="space-y-4 rounded-lg border border-border/70 bg-background p-4" data-testid="qr-light-config">
            <Label className="font-medium">{t('imageDetect.lightConfig')}</Label>
            <div className="space-y-2">
              <Label>{t('imageDetect.execAction')}</Label>
              <Select
                value={actions.qr_light_action}
                onValueChange={(action) => onActionsChange({ ...actions, qr_light_action: action as ImageDetectActionConfig['qr_light_action'] })}
              >
                <SelectTrigger className="w-[280px] max-w-full" data-testid="qr-light-action"><SelectValue /></SelectTrigger>
                <SelectContent data-testid="qr-light-action-options">
                  {LIGHT_ACTIONS.map((action) => <SelectItem key={action} value={action} data-testid={`qr-light-action-${action}`}>{t(`actions.${action}`)}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
        )}

        {config.qr_mode === 'deep' && (
          <div className="space-y-5 rounded-lg border border-border/70 bg-background p-4" data-testid="qr-deep-config">
            <div>
              <Label className="font-medium">{t('imageDetect.deepConfig')}</Label>
              <p className="mt-1 text-xs text-muted-foreground">{t('imageDetect.routeModules')}</p>
            </div>

            <div className="space-y-4">
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <Checkbox checked={routes.url_check} onCheckedChange={(checked) => onRoutesChange({ ...routes, url_check: checked === true })} data-testid="qr-route-url" />
                  <Label>{t('imageDetect.urlDetection')}</Label>
                </div>
                {routes.url_check && (
                  <div className="ml-6 flex items-center gap-2" data-testid="qr-route-url-options">
                    <span className="text-xs text-muted-foreground">{t('imageDetect.expandShortLink')}：</span>
                    <Switch checked={routes.url_unshorten} onCheckedChange={(checked) => onRoutesChange({ ...routes, url_unshorten: checked })} data-testid="qr-route-url-unshorten" />
                    <span className="text-xs">{t('imageDetect.enable')}</span>
                  </div>
                )}
              </div>

              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <Checkbox checked={routes.keyword_filter} onCheckedChange={(checked) => onRoutesChange({ ...routes, keyword_filter: checked === true })} data-testid="qr-route-keyword" />
                  <Label>{t('imageDetect.keywordFilter')}</Label>
                </div>
                {routes.keyword_filter && (
                  <div className="ml-6 flex flex-wrap items-center gap-3" data-testid="qr-route-keyword-options">
                    <span className="text-xs text-muted-foreground">{t('imageDetect.scanRange')}</span>
                    <label className="flex items-center gap-1.5 text-xs">
                      <Checkbox checked={routes.keyword_scope_url} onCheckedChange={(checked) => onRoutesChange({ ...routes, keyword_scope_url: checked === true })} data-testid="qr-route-keyword-scope-url" />
                      {t('imageDetect.urlPath')}
                    </label>
                    <label className="flex items-center gap-1.5 text-xs">
                      <Checkbox checked={routes.keyword_scope_text} onCheckedChange={(checked) => onRoutesChange({ ...routes, keyword_scope_text: checked === true })} data-testid="qr-route-keyword-scope-text" />
                      {t('imageDetect.textContent')}
                    </label>
                  </div>
                )}
              </div>

              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <Checkbox checked={routes.intent_engine} onCheckedChange={(checked) => onRoutesChange({ ...routes, intent_engine: checked === true })} data-testid="qr-route-intent" />
                  <Label>{t('imageDetect.intentEngine')}</Label>
                </div>
                {routes.intent_engine && (
                  <div className="ml-6 space-y-2" data-testid="qr-route-intent-options">
                    <span className="text-xs text-muted-foreground">{t('imageDetect.detectCategory')}</span>
                    <div className="flex flex-wrap gap-3">
                      {([
                        ['intent_high', 'highRisk'],
                        ['intent_medium', 'mediumRisk'],
                        ['intent_low', 'lowRisk'],
                      ] as const).map(([key, label]) => (
                        <label key={key} className="flex items-center gap-1.5 text-xs">
                          <Checkbox checked={routes[key]} onCheckedChange={(checked) => onRoutesChange({ ...routes, [key]: checked === true })} data-testid={`qr-route-${key.replace('_', '-')}`} />
                          {t(`imageDetect.${label}`)}
                        </label>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <Checkbox checked={routes.advanced_rules} onCheckedChange={(checked) => onRoutesChange({ ...routes, advanced_rules: checked === true })} data-testid="qr-route-advanced" />
                  <Label>{t('imageDetect.advancedRule')}</Label>
                </div>
                {routes.advanced_rules && <p className="ml-6 text-xs text-muted-foreground" data-testid="advanced-rule-hint">{t('imageDetect.advancedRuleHint')}</p>}
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="qr-deep-limit">{infoLabel(t('imageDetect.detectLimit'), t('tooltips.qrLimit'), 'qr-deep-limit')}</Label>
                <div className="flex items-center gap-2">
                  <Input
                    id="qr-deep-limit"
                    type="number"
                    min={1}
                    max={50}
                    value={config.qr_max_count}
                    onChange={(event) => setQrLimit(Number(event.target.value))}
                    className="w-20"
                    data-testid="qr-deep-limit"
                  />
                  <span className="text-sm text-muted-foreground">{t('imageDetect.items')}</span>
                </div>
              </div>
              <div className="space-y-2">
                <Label>{t('imageDetect.exceedAction')}</Label>
                <Select
                  value={actions.qr_deep_exceed_action === 'proceed' ? 'pass_warn' : 'quarantine'}
                  onValueChange={(action) => onActionsChange({
                    ...actions,
                    qr_deep_exceed_action: action === 'pass_warn' ? 'proceed' : 'quarantine',
                    qr_deep_exceed_warn: action === 'pass_warn',
                  })}
                >
                  <SelectTrigger className="w-[220px] max-w-full" data-testid="qr-deep-exceed-action"><SelectValue /></SelectTrigger>
                  <SelectContent data-testid="qr-deep-exceed-action-options">
                    <SelectItem value="pass_warn" data-testid="qr-deep-exceed-action-pass-warn">{t('imageDetect.passWarn')}</SelectItem>
                    <SelectItem value="quarantine" data-testid="qr-deep-exceed-action-quarantine">{t('imageDetect.isolateFallback')}</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground" data-testid="qr-deep-exceed-action-hint">
                  {actions.qr_deep_exceed_action === 'proceed'
                    ? t('imageDetect.exceedActionHint_pass')
                    : t('imageDetect.exceedActionHint_quarantine')}
                </p>
              </div>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
