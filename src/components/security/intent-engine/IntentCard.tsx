'use client';

import { useTranslations } from 'next-intl';
import type {
  IntentType,
  IntentDirection,
  IntentSingleConfig,
  UIIntentAction,
  IntentRiskLevel,
  DetectionMode,
} from '@/types/intent-engine';
import {
  RECEIVE_UI_ACTIONS,
  NON_RECEIVE_UI_ACTIONS,
  RISK_LEVEL_OF,
  toUIAction,
  thresholdActionSummary,
  applyUIAction,
} from '@/types/intent-engine';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from '@/components/ui/tooltip';
import { ChevronDown, ChevronRight, AlertTriangle, HelpCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { usePointerHover } from '@/hooks/use-pointer-hover';
import { MarkDeliverConfig } from './MarkDeliverConfig';
import { ThresholdSegmentConfig } from './ThresholdSegmentConfig';

interface IntentCardProps {
  intent: IntentType;
  direction: IntentDirection;
  value: IntentSingleConfig;
  expanded: boolean;
  engineEnabled: boolean;
  onToggleExpand: () => void;
  onChange: (next: IntentSingleConfig) => void;
}

// GT-11743: 风险等级样式 — 使用 webapp design token（destructive / warning / info）
// 对齐 demo 原型 IntentCard 的 left-border + 展开后头部背景色效果
const RISK_STYLES: Record<IntentRiskLevel, { border: string; bg: string; badge: 'destructive' | 'secondary' | 'outline' }> = {
  high: {
    border: 'border-l-destructive',
    bg: 'bg-destructive/5 dark:bg-destructive/10',
    badge: 'destructive',
  },
  medium: {
    border: 'border-l-warning',
    bg: 'bg-warning/10 dark:bg-warning/15',
    badge: 'secondary',
  },
  low: {
    border: 'border-l-info',
    bg: 'bg-info/10 dark:bg-info/15',
    badge: 'outline',
  },
};

// GT-11743/D-09: 动作色映射 — 卡头 Badge + Select 选项文字色，对齐 demo 动作语义色
const ACTION_TEXT_COLOR: Record<UIIntentAction, string> = {
  mark_deliver: 'text-[var(--action-mark-deliver)]',
  quarantine: 'text-[var(--action-quarantine)]',
  audit: 'text-[var(--action-review)]',
  discard: 'text-red-700 dark:text-red-400',
};

export function IntentCard({
  intent,
  direction,
  value,
  expanded,
  engineEnabled,
  onToggleExpand,
  onChange,
}: IntentCardProps) {
  const tName = useTranslations('intentEngine.intent');
  const tDesc = useTranslations('intentEngine.intentDesc');
  const tAction = useTranslations('intentEngine.action');
  const tRisk = useTranslations('intentEngine.riskBadge');
  const tCommon = useTranslations('intentEngine');
  const tMode = useTranslations('intentEngine.detectionMode');

  const risk = RISK_LEVEL_OF[intent];
  const riskStyles = RISK_STYLES[risk];
  const uiActions = direction === 'receive' ? RECEIVE_UI_ACTIONS : NON_RECEIVE_UI_ACTIONS;
  const uiAction = toUIAction(value);
  const thresholdSummary = thresholdActionSummary(value.threshold_segments);
  const detectionMode: DetectionMode = value.detection_mode || 'classification';
  const dimmed = !value.enabled;
  const showHighRiskWarning = uiAction === 'mark_deliver' && risk === 'high';
  const showMarkDeliverConfig =
    direction === 'receive' && uiAction === 'mark_deliver' && detectionMode === 'classification';

  const handleActionChange = (v: string | null) => {
    if (!v) return;
    onChange(applyUIAction(value, v as UIIntentAction, intent));
  };

  const handleModeChange = (mode: DetectionMode) => {
    onChange({ ...value, detection_mode: mode });
  };

  const handleThresholdChange = (segments: IntentSingleConfig['threshold_segments']) => {
    onChange({ ...value, threshold_segments: segments });
  };

  // 卡片头是唯一可点区域（展开/收起）——pointer 驱动 hover（柔和交互反馈规格 §6.4/§7.2）。
  const { pointerHoverProps: headerHoverProps } = usePointerHover<HTMLDivElement>();

  return (
    <TooltipProvider>
      {/* GT-11743: 对齐 demo 原型 — 外层只控制边框/阴影/裁剪，padding 由内部 header/body 各自控制 */}
      <div
        data-testid={`ie-card-${direction}-${intent}`}
        className={cn(
          'rounded-lg border border-l-4 overflow-hidden transition-shadow duration-[240ms] ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none',
          riskStyles.border,
          expanded ? 'shadow-md' : 'shadow-sm',
        )}
      >
        {/* 卡片头部（可点击展开）— GT-11743: 左右分组、背景色随 expanded 切换 */}
        <div
          role="button"
          tabIndex={0}
          data-testid={`ie-toggle-${direction}-${intent}`}
          className={cn(
            'flex items-center justify-between p-4 cursor-pointer outline-none',
            'transition-[background-color] duration-[180ms] ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none',
            'focus-visible:ring-2 focus-visible:ring-ring/60 focus-visible:ring-inset',
            expanded ? riskStyles.bg : 'bg-card data-[hovered=true]:bg-muted/50',
          )}
          {...headerHoverProps}
          onClick={onToggleExpand}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              onToggleExpand();
            }
          }}
        >
          {/* 左侧：Switch + 名称 + 风险 Badge + Help */}
          <div className="flex items-center gap-3 min-w-0">
            {/* GT-12207: 开关必须包一层自己拦截冒泡的容器。
                Switch 自身的 onClick={stopPropagation} 挡不住外层 header 的
                onClick（base-ui Switch 渲染成 span[role=switch]，真正被点中的是
                内部元素，事件仍会冒泡到 header），结果「关闭意图」同时触发了
                onToggleExpand 把卡片折叠 —— 配置控件整块从 DOM/可访问树消失，
                看上去像是禁用后控件被移除。禁用态本身的灰化渲染是对的
                （GT-11743：opacity-50 + pointer-events-none，控件保留且 disabled）。 */}
            <span
              onClick={(e) => e.stopPropagation()}
              onKeyDown={(e) => e.stopPropagation()}
              data-testid={`ie-switch-wrap-${direction}-${intent}`}
            >
              <Switch
                size="sm"
                checked={value.enabled}
                onCheckedChange={(enabled) => onChange({ ...value, enabled })}
                disabled={!engineEnabled}
                className="data-[state=checked]:bg-primary"
              />
            </span>
            <span className="text-sm font-medium truncate">{tName(intent)}</span>
            <Badge variant={riskStyles.badge} className="text-[10px]">
              {tRisk(risk)}
            </Badge>
            <Tooltip>
              <TooltipTrigger render={<HelpCircle className="h-3.5 w-3.5 text-muted-foreground cursor-help shrink-0" />} />
              <TooltipContent>
                <p>{tDesc(intent)}</p>
              </TooltipContent>
            </Tooltip>
          </div>
          {/* 右侧：检测模式 Badge + 动作 Badge + 展开箭头 */}
          <div className="flex items-center gap-3 shrink-0">
            <Badge variant="outline" className="text-[10px]">
              {detectionMode === 'classification' ? tMode('classification') : tMode('threshold')}
            </Badge>
            {detectionMode === 'threshold' ? (
              // GT-12171 D-03：分段阈值模式下卡头显示区间处置摘要（各段动作按区间
              // 升序去重），而非分类模式的单一动作，让管理员一眼看清配置结果。
              <Badge
                variant="outline"
                className="text-[10px]"
                data-testid={`ie-action-summary-${direction}-${intent}`}
              >
                {thresholdSummary.length > 0
                  ? thresholdSummary.map((a) => tAction(a)).join(' · ')
                  : tAction(uiAction)}
              </Badge>
            ) : (
              <Badge
                variant="outline"
                className={cn('text-[10px]', ACTION_TEXT_COLOR[uiAction])}
                data-testid={`ie-action-badge-${direction}-${intent}`}
              >
                {tAction(uiAction)}
              </Badge>
            )}
            <span className="text-muted-foreground">
              {expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
            </span>
          </div>
        </div>

        {/* 卡片展开内容 — GT-11743: 顶部 border-t、padding p-4，禁启用时整块半透明 */}
        {expanded && (
          <div className={cn('p-4 space-y-4 border-t border-border', dimmed && 'opacity-50 pointer-events-none')}>
            {showHighRiskWarning && (
              <div className="flex items-center gap-2 p-2.5 bg-destructive/5 dark:bg-destructive/10 border border-destructive/30 rounded-lg text-sm text-destructive">
                <AlertTriangle className="h-4 w-4 shrink-0" />
                {tCommon('highRiskWarning')}
              </div>
            )}

            {/* GT-11745: 检测模式 */}
            <div className="space-y-2">
              <Label className="text-sm text-muted-foreground">{tMode('label')}</Label>
              <div className="flex items-center gap-3">
                <RadioGroup
                  value={detectionMode}
                  onValueChange={(v) => handleModeChange(v as DetectionMode)}
                  className="flex items-center gap-4"
                  disabled={!value.enabled || !engineEnabled}
                >
                  <div className="flex items-center gap-2">
                    <RadioGroupItem value="classification" id={`mode-class-${intent}-${direction}`} />
                    <Label htmlFor={`mode-class-${intent}-${direction}`} className="text-sm cursor-pointer">{tMode('classification')}</Label>
                  </div>
                  <div className="flex items-center gap-2">
                    <RadioGroupItem value="threshold" id={`mode-threshold-${intent}-${direction}`} />
                    <Label htmlFor={`mode-threshold-${intent}-${direction}`} className="text-sm cursor-pointer">{tMode('threshold')}</Label>
                  </div>
                </RadioGroup>
                <Tooltip>
                  <TooltipTrigger render={<HelpCircle className="h-4 w-4 text-muted-foreground cursor-help" />} />
                  <TooltipContent side="top" className="max-w-xs">
                    <p className="text-xs">
                      <strong>{tMode('classification')}：</strong>{tMode('classificationDesc')}
                      <br />
                      <strong>{tMode('threshold')}：</strong>{tMode('thresholdDesc')}
                    </p>
                  </TooltipContent>
                </Tooltip>
              </div>
            </div>

            {/* 分类优先模式配置 */}
            {detectionMode === 'classification' && (
              <div className="space-y-3">
                <div className="space-y-2">
                  <Label className="text-sm text-muted-foreground">{tCommon('actionLabel')}</Label>
                  <div className="flex items-center gap-2">
                    <Select
                      value={uiAction}
                      onValueChange={handleActionChange}
                      disabled={!value.enabled || !engineEnabled}
                    >
                      <SelectTrigger className="w-32">
                        <SelectValue>{tAction(uiAction)}</SelectValue>
                      </SelectTrigger>
                      <SelectContent>
                        {uiActions.map((a) => (
                          <SelectItem key={a} value={a}>
                            <span className={ACTION_TEXT_COLOR[a]}>{tAction(a)}</span>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {showHighRiskWarning && (
                      <Tooltip>
                        <TooltipTrigger render={<AlertTriangle className="h-4 w-4 text-amber-500" />} />
                        <TooltipContent side="top" className="max-w-xs">
                          <p className="text-xs">{tCommon('highRiskWarning')}</p>
                        </TooltipContent>
                      </Tooltip>
                    )}
                  </div>
                </div>
                {showMarkDeliverConfig && value.mark_config && (
                  <MarkDeliverConfig
                    value={value.mark_config}
                    intent={intent}
                    onChange={(mark_config) => onChange({ ...value, mark_config })}
                    disabled={!value.enabled || !engineEnabled}
                  />
                )}
              </div>
            )}

            {/* 分段阈值模式配置 */}
            {detectionMode === 'threshold' && value.threshold_segments && (
              <ThresholdSegmentConfig
                segments={value.threshold_segments}
                onChange={handleThresholdChange}
                direction={direction}
                disabled={!value.enabled || !engineEnabled}
              />
            )}
          </div>
        )}
      </div>
    </TooltipProvider>
  );
}
