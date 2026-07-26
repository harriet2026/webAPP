'use client';

import { useTranslations } from 'next-intl';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { AlertTriangle, Lock, Info } from 'lucide-react';
import { RescanPolicySection } from './RescanPolicySection';
import { FieldLabel } from './field-label';
import type { Direction, URLProtectionSettings } from '@/types/url-protection';

interface Props {
  direction: Direction;
  settings: URLProtectionSettings | null;
  onPatch: (patch: Partial<URLProtectionSettings>) => void;
}

// 链接保护 Tab 只承载子项配置：模块启停由页头的统一总开关控制，
// 这里不再渲染重复的“链接保护”开关。
export function LinkProtectionTab({ direction, settings, onPatch }: Props) {
  const t = useTranslations('urlProtection.linkProtection');

  // 非接收方向（demo 运行态不可达，按源码对齐 —— html_spec layer-3 状态 3C / D-001）
  if (direction !== 'receive') {
    return (
      <div className="space-y-6" data-testid="link-protection-tab">
        <div className="p-6 bg-muted/60 rounded-lg border" data-testid="link-protection-non-receive-notice">
          <div className="flex items-start gap-3">
            <Info className="h-5 w-5 text-muted-foreground mt-0.5 flex-shrink-0" />
            <div className="space-y-2">
              <p className="font-medium text-muted-foreground">{t('nonReceive.title')}</p>
              <p className="text-sm text-muted-foreground">{t('nonReceive.body')}</p>
            </div>
          </div>
        </div>
        <div className="max-w-sm p-4 bg-muted rounded-lg text-center opacity-50" data-testid="link-protection-non-receive-policy-card">
          <p className="text-xs text-muted-foreground mb-1">{t('nonReceive.policyCard')}</p>
          <p className="text-sm font-medium text-muted-foreground">{t('nonReceive.disabled')}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6" data-testid="link-protection-tab">
      <div className="space-y-6" data-testid="link-protection-zone">
        {/* 链接保护说明提示（需求文档 §3：链接保护字段的 toggleTip）。
            原提示挂在 Tab 内开关上，开关随统一总开关移除后提示一并丢失（GT-12223），
            现以字段标签形式补回。 */}
        <FieldLabel tip={t('toggleTip')} testId="link-protection-toggle-tooltip-trigger">
          {t('toggle')}
        </FieldLabel>
        {/* 点击时安全策略（固定） */}
        <div className="space-y-3" data-testid="link-protection-fixed-policy">
          <Label className="font-medium">{t('policy.title')}</Label>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="p-4 bg-red-50 dark:bg-red-950/20 rounded-lg border border-red-200 dark:border-red-800" data-testid="link-protection-known-malicious-card">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4 text-red-500" />
                  <span className="text-sm font-medium">{t('policy.knownMalicious')}</span>
                </div>
                <Badge variant="destructive" className="text-xs">{t('policy.blockAndAlert')}</Badge>
              </div>
              <p className="text-xs text-muted-foreground mt-2">{t('policy.knownMaliciousDesc')}</p>
            </div>
            <div className="p-4 bg-amber-50 dark:bg-amber-950/20 rounded-lg border border-amber-200 dark:border-amber-800" data-testid="link-protection-unknown-card">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Lock className="h-4 w-4 text-amber-500" />
                  <span className="text-sm font-medium">{t('policy.unknown')}</span>
                </div>
                <Badge variant="outline" className="text-xs border-amber-500 text-amber-700 dark:text-amber-300">
                  {t('policy.blockAndAlert')}
                </Badge>
              </div>
              <p className="text-xs text-muted-foreground mt-2">{t('policy.unknownDesc')}</p>
            </div>
          </div>
          <p className="text-xs text-muted-foreground flex items-center gap-1" data-testid="link-protection-fixed-notice">
            <Lock className="h-3 w-3" />
            {t('policy.fixedNotice')}
          </p>
        </div>

        {/* 点击时复检策略（demo 演进块，0709 需求） */}
        {settings && <RescanPolicySection settings={settings} onChange={onPatch} />}
      </div>
    </div>
  );
}
