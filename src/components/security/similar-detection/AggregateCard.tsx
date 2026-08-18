'use client';

import { useTranslations } from 'next-intl';
import type { SimilarDetectionDirectionConfig, SimilarDetectionType } from './types';
import { SIMILAR_DETECTION_ACTION_OPTIONS } from './action-options';
import { TagDeliveryPanel } from './TagDeliveryPanel';
import { Switch } from '@/components/ui/switch';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Slider } from '@/components/ui/slider';
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from '@/components/ui/tooltip';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Info, Eye, Layers } from 'lucide-react';
import { cn } from '@/lib/utils';

interface AggregateCardProps {
  detectionType: SimilarDetectionType;
  value: SimilarDetectionDirectionConfig;
  onChange: (patch: Partial<SimilarDetectionDirectionConfig>) => void;
  disabled?: boolean;
}

// 聚合模式配置卡片：结构 = demo renderAggregateConfig（1:1 移植 JSX/类名/图标），
// 无同步按钮、无观察日志链接，字段区为 4 列栅格、动作 Select 全宽。
export function AggregateCard({ detectionType, value, onChange, disabled }: AggregateCardProps) {
  const t = useTranslations('similarDetection');

  // 数字输入统一取整+钳制（最小值 1）
  const clampInt = (raw: string) => Math.max(1, Math.round(Number(raw) || 0));

  return (
    <div
      data-testid="similar-detection-card-aggregate"
      className={cn(
        'border rounded-lg p-4 transition-[background-color,border-color] duration-[240ms] ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none',
        value.observe_mode
          ? 'border-amber-300 dark:border-amber-700 bg-amber-50/50 dark:bg-amber-950/20'
          : 'border-blue-200 dark:border-blue-800 bg-white dark:bg-gray-950',
      )}
    >
      {/* 卡片头部 */}
      <div className="flex items-center justify-between mb-4 min-w-0">
        <div className="flex items-center gap-2 min-w-0">
          <Layers className="h-4 w-4" />
          <span className="font-medium truncate">{t('modeAggregate')}</span>
          {value.observe_mode && (
            <Badge variant="outline" className="bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 border-amber-300">
              <Eye className="h-3 w-3 mr-1" />
              {t('observeMode')}
            </Badge>
          )}
        </div>
      </div>

      {/* 观察模式开关 */}
      <div className="flex items-center justify-between p-3 bg-muted/50 rounded-lg mb-4">
        <div className="flex items-center gap-2">
          <Eye className="h-4 w-4 text-gray-500" />
          <span className="text-sm font-medium">{t('observeMode')}</span>
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger render={<Info className="h-3.5 w-3.5 text-muted-foreground shrink-0 cursor-help" />} />
              <TooltipContent>{t('tooltipObserve')}</TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
        <div className="flex items-center gap-2">
          <span className={cn('text-xs', value.observe_mode ? 'text-amber-600' : 'text-gray-500')}>
            {value.observe_mode ? t('observeModeOn') : t('observeModeOff')}
          </span>
          <Switch
            data-testid="similar-detection-observe-aggregate"
            checked={value.observe_mode}
            onCheckedChange={(observe_mode) => onChange({ observe_mode })}
            disabled={disabled}
          />
        </div>
      </div>

      {/* GT-12228: 抽屉内容区在 1024px 视口下仅 ~456px 宽，不能用视口断点 md/lg 做多列。
          改为 min-[1366px]（抽屉从 560px 跳到 80vw 的断点）才启用 4 列。 */}
      <div className="grid grid-cols-2 min-[1366px]:grid-cols-4 gap-4">
        {/* 检测窗口 */}
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger render={<Info className="h-3.5 w-3.5 text-muted-foreground shrink-0 cursor-help" />} />
                <TooltipContent>{t('tooltipWindow')}</TooltipContent>
              </Tooltip>
            </TooltipProvider>
            <Label className="text-sm">{t('detectionWindow')}</Label>
          </div>
          <div className="flex items-center gap-2">
            <Input
              type="number"
              value={value.window_minutes}
              onChange={(e) => onChange({ window_minutes: clampInt(e.target.value) })}
              disabled={disabled}
              className="w-20 h-8"
            />
            <span className="text-sm text-gray-500">{t('minutes')}</span>
          </div>
        </div>

        {/* 相似度阈值（仅相似邮件检测显示） */}
        {detectionType === 'similar_email' && (
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger render={<Info className="h-3.5 w-3.5 text-muted-foreground shrink-0 cursor-help" />} />
                  <TooltipContent>{t('tooltipThreshold')}</TooltipContent>
                </Tooltip>
              </TooltipProvider>
              <Label className="text-sm">{t('similarityThreshold')}</Label>
            </div>
            <div className="flex items-center gap-2">
              <Slider
                value={[value.similarity_pct]}
                onValueChange={([v]) => onChange({ similarity_pct: v })}
                min={50}
                max={100}
                step={5}
                disabled={disabled}
                className="flex-1"
              />
              <span className="text-sm font-medium w-12">{value.similarity_pct}%</span>
            </div>
          </div>
        )}

        {/* 触发数量 */}
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger render={<Info className="h-3.5 w-3.5 text-muted-foreground shrink-0 cursor-help" />} />
                <TooltipContent>{t('tooltipMinCount')}</TooltipContent>
              </Tooltip>
            </TooltipProvider>
            <Label className="text-sm">{t('triggerCount')}</Label>
          </div>
          <div className="flex items-center gap-2">
            <Input
              type="number"
              value={value.min_count}
              onChange={(e) => onChange({ min_count: clampInt(e.target.value) })}
              disabled={disabled}
              className="w-20 h-8"
            />
            <span className="text-sm text-gray-500">{t('emails')}</span>
          </div>
        </div>

        {/* 触发动作 */}
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger render={<Info className="h-3.5 w-3.5 text-muted-foreground shrink-0 cursor-help" />} />
                <TooltipContent>{t('tooltipAction')}</TooltipContent>
              </Tooltip>
            </TooltipProvider>
            <Label className="text-sm">{t('triggerAction')}</Label>
          </div>
          <Select
            value={value.action}
            onValueChange={(v) => onChange({ action: v as SimilarDetectionDirectionConfig['action'] })}
            disabled={disabled || value.observe_mode}
          >
            <SelectTrigger
              data-testid="similar-detection-action-aggregate"
              className={cn('w-full h-8', value.observe_mode && 'opacity-50')}
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {SIMILAR_DETECTION_ACTION_OPTIONS.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>
                  {t(opt.labelKey)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* 标记投递配置 */}
      {value.action === 'mark-delivery' && !value.observe_mode && (
        <div className="mt-4">
          <TagDeliveryPanel value={value} onChange={onChange} disabled={disabled} />
        </div>
      )}
    </div>
  );
}
