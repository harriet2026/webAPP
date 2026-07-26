'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { AlertTriangle, Clock, Info, ListChecks, Search, Bot, Globe, SkipForward } from 'lucide-react';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useProductForm } from '@/contexts/product-form-context';
import type { URLProtectionSettings, DeepInspectTimeoutPolicy } from '@/types/url-protection';

const TIMEOUT_MIN = 10;
const TIMEOUT_MAX = 120;

interface Props {
  settings: URLProtectionSettings;
  onChange: (patch: Partial<URLProtectionSettings>) => void;
}

// html_spec 补录 E-1..E-8（demo 演进的「点击时复检策略」块，0709 需求）：
// 蓝色耗时预期框、M1/M2/M3 行卡（带图标）、深度复检双形态渲染（引擎按形态切换）、
// 超时上限 + 超时兜底策略下拉（GT 决策#2）、允许跳过 + 红色风险横幅。草稿模式：onChange 汇入页面草稿。
export function RescanPolicySection({ settings, onChange }: Props) {
  const t = useTranslations('urlProtection.rescan');
  const { capabilities } = useProductForm();
  const engine = capabilities?.ai ? t('engineAi') : t('engineLegacy');
  const EngineIcon = capabilities?.ai ? Bot : Globe;

  // demo 行为：越界值不写入草稿，受控输入立即回弹到上次合法值，同时保留错误提示。
  const [timeoutInvalid, setTimeoutInvalid] = useState(false);

  return (
    <section className="space-y-3" data-testid="rescan-policy-section">
      <div>
        <Label className="font-medium">{t('title')}</Label>
        <p className="text-xs text-muted-foreground mt-0.5">{t('desc')}</p>
      </div>

      {/* 耗时预期说明（蓝色 Info 框） */}
      <div
        className="flex items-start gap-2 p-3 bg-blue-50 dark:bg-blue-950/20 rounded-lg border border-blue-200 dark:border-blue-800"
        data-testid="rescan-cost-hint"
      >
        <Info className="h-4 w-4 text-blue-600 mt-0.5 flex-shrink-0" />
        <p className="text-xs text-blue-700 dark:text-blue-300">{t('costHint')}</p>
      </div>

      <RescanRow
        icon={<ListChecks className="h-5 w-5 text-green-500 flex-shrink-0" />}
        label={t('m1.title')} desc={t('m1.desc')} aria="rescan-blacklist" testId="rescan-blacklist"
        checked={settings.rescan_blacklist}
        onCheckedChange={(v) => onChange({ rescan_blacklist: v })}
      />
      <RescanRow
        icon={<Search className="h-5 w-5 text-blue-500 flex-shrink-0" />}
        label={t('m2.title')} desc={t('m2.desc')} aria="rescan-query-intel" testId="rescan-query-intel"
        checked={settings.rescan_query_intel}
        onCheckedChange={(v) => onChange({ rescan_query_intel: v })}
      />

      {/* M3 深度复检：双形态渲染，引擎徽章按形态（AI=钓鱼邮件智能体 / 传统=URL 沙箱） */}
      <div className="p-4 bg-muted/40 rounded-lg border space-y-4" data-testid="rescan-deep-inspect-card">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <EngineIcon className="h-5 w-5 text-purple-500 flex-shrink-0" />
            <div>
              <div className="flex items-center gap-2">
                <Label className="font-medium">{t('m3.title')}</Label>
                <Badge
                  variant="outline"
                  className="text-xs border-purple-400 text-purple-700 dark:text-purple-300"
                  data-testid="rescan-deep-inspect-engine"
                >
                  {engine}
                </Badge>
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">{t('m3.desc', { engine })}</p>
            </div>
          </div>
          <Switch
            aria-label="rescan-deep-inspect"
            data-testid="rescan-deep-inspect-toggle"
            checked={settings.rescan_deep_inspect}
            onCheckedChange={(v) => onChange({ rescan_deep_inspect: v })}
          />
        </div>

        {settings.rescan_deep_inspect && (
          <div className="space-y-4 pt-4 border-t" data-testid="rescan-deep-inspect-settings">
            {/* 耗时告知（琥珀） */}
            <div
              className="flex items-start gap-2 p-3 bg-amber-50 dark:bg-amber-950/30 rounded-lg border border-amber-200 dark:border-amber-800"
              data-testid="deep-inspect-cost-banner"
            >
              <Clock className="h-4 w-4 text-amber-600 mt-0.5 flex-shrink-0" />
              <p className="text-xs text-amber-700 dark:text-amber-300">{t('costBanner', { engine })}</p>
            </div>

            {/* 超时上限 */}
            <div className="space-y-2">
              <Label className="text-sm" htmlFor="deep-inspect-timeout">{t('timeout.label')}</Label>
              <div className="flex items-center gap-2">
                <Input
                  id="deep-inspect-timeout"
                  aria-label="deep-inspect-timeout"
                  type="number"
                  min={TIMEOUT_MIN}
                  max={TIMEOUT_MAX}
                  value={settings.deep_inspect_timeout_sec}
                  onChange={(e) => {
                    const next = e.target.value;
                    const n = Number(next);
                    if (next.trim() === '' || !Number.isFinite(n) || n < TIMEOUT_MIN || n > TIMEOUT_MAX) {
                      setTimeoutInvalid(true);
                      return;
                    }
                    setTimeoutInvalid(false);
                    onChange({ deep_inspect_timeout_sec: n });
                  }}
                  className={timeoutInvalid ? 'w-24 border-destructive' : 'w-24'}
                  data-testid="deep-inspect-timeout-input"
                />
                <span className="text-sm text-muted-foreground">{t('timeout.unit')}</span>
              </div>
              {timeoutInvalid && (
                <p className="text-xs text-destructive" data-testid="deep-inspect-timeout-error">
                  {t('timeout.rangeError')}
                </p>
              )}
              <p className="text-xs text-muted-foreground">{t('timeout.hint', { engine })}</p>
            </div>

            {/* 超时兜底策略（GT 决策#2） */}
            <div className="space-y-2">
              <Label className="text-sm">{t('timeoutPolicy.label')}</Label>
              <Select
                value={settings.deep_inspect_timeout_policy}
                onValueChange={(v) => onChange({ deep_inspect_timeout_policy: v as DeepInspectTimeoutPolicy })}
              >
                <SelectTrigger
                  className="w-full md:w-[320px]"
                  aria-label="deep-inspect-timeout-policy"
                  data-testid="deep-inspect-timeout-policy-trigger"
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent data-testid="deep-inspect-timeout-policy-content">
                  <SelectItem value="block" data-testid="deep-inspect-timeout-policy-block">{t('timeoutPolicy.block')}</SelectItem>
                  <SelectItem value="allow" data-testid="deep-inspect-timeout-policy-allow">{t('timeoutPolicy.allow')}</SelectItem>
                  <SelectItem value="hold" data-testid="deep-inspect-timeout-policy-hold">{t('timeoutPolicy.hold')}</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">{t('timeoutPolicy.hint')}</p>
            </div>

            {/* 允许用户跳过深度检测 */}
            <div className="space-y-3 pt-4 border-t">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <SkipForward className="h-5 w-5 text-orange-500 flex-shrink-0" />
                  <div>
                    <Label className="font-medium">{t('skip.title')}</Label>
                    <p className="text-xs text-muted-foreground mt-0.5">{t('skip.desc', { engine })}</p>
                  </div>
                </div>
                <Switch
                  aria-label="allow-user-skip"
                  data-testid="allow-user-skip-toggle"
                  checked={settings.allow_user_skip_deep_inspect}
                  onCheckedChange={(v) => onChange({ allow_user_skip_deep_inspect: v })}
                />
              </div>
              {settings.allow_user_skip_deep_inspect && (
                <div
                  className="flex items-start gap-2 p-3 bg-red-50 dark:bg-red-950/30 rounded-lg border border-red-200 dark:border-red-800"
                  data-testid="allow-skip-risk-banner"
                >
                  <AlertTriangle className="h-4 w-4 text-red-600 mt-0.5 flex-shrink-0" />
                  <p className="text-xs text-red-700 dark:text-red-300">{t('skip.riskBanner')}</p>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </section>
  );
}

function RescanRow({ icon, label, desc, aria, testId, checked, onCheckedChange }: {
  icon: React.ReactNode;
  label: string;
  desc: string;
  aria: string;
  testId: string;
  checked: boolean;
  onCheckedChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between p-4 bg-muted/40 rounded-lg border" data-testid={`${testId}-row`}>
      <div className="flex items-center gap-3">
        {icon}
        <div>
          <Label className="font-medium">{label}</Label>
          <p className="text-xs text-muted-foreground mt-0.5">{desc}</p>
        </div>
      </div>
      <Switch
        aria-label={aria}
        data-testid={`${testId}-toggle`}
        checked={checked}
        onCheckedChange={onCheckedChange}
      />
    </div>
  );
}
