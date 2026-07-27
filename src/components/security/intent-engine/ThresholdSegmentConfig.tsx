'use client';

import { useMemo } from 'react';
import { useTranslations } from 'next-intl';
import type {
  IntentDirection,
  ThresholdSegment,
  IntentAction,
} from '@/types/intent-engine';
import { thresholdActionsForDirection } from '@/types/intent-engine';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Plus, Trash2, AlertCircle, CheckCircle2 } from 'lucide-react';
import { cn } from '@/lib/utils';

const ACTION_COLOR: Record<IntentAction, string> = {
  accept: 'bg-[var(--action-mark-deliver)]',
  quarantine: 'bg-[var(--action-quarantine)]',
  audit: 'bg-[var(--action-review)]',
  reject: 'bg-[var(--action-block)]',
  discard: 'bg-red-700',
};

interface ThresholdSegmentConfigProps {
  segments: ThresholdSegment[];
  onChange: (segments: ThresholdSegment[]) => void;
  direction: IntentDirection;
  disabled?: boolean;
}

export function ThresholdSegmentConfig({ segments, onChange, direction, disabled }: ThresholdSegmentConfigProps) {
  const t = useTranslations('intentEngine.threshold');
  const tAction = useTranslations('intentEngine.action');

  const sorted = useMemo(() => [...segments].sort((a, b) => a.min - b.min), [segments]);
  const actions = thresholdActionsForDirection(direction);

  const hasGap = useMemo(() => {
    if (sorted.length === 0) return true;
    if (sorted[0].min > 0.001) return true;
    if (sorted[sorted.length - 1].max < 0.999) return true;
    for (let i = 0; i < sorted.length - 1; i++) {
      if (Math.abs(sorted[i].max - sorted[i + 1].min) > 0.001) return true;
    }
    return false;
  }, [sorted]);

  const handleSegmentChange = (idx: number, updates: Partial<ThresholdSegment>) => {
    const updated = segments.map((s, i) => (i === idx ? { ...s, ...updates } : s));
    onChange(updated);
  };

  const handleAddSegment = () => {
    if (sorted.length === 0) {
      onChange([{ min: 0, max: 1, action: 'quarantine' }]);
      return;
    }
    const last = sorted[sorted.length - 1];
    if (last.max < 1) {
      onChange([...segments, { min: last.max, max: 1, action: last.action }]);
    }
  };

  const handleRemoveSegment = (idx: number) => {
    if (segments.length <= 1) return;
    onChange(segments.filter((_, i) => i !== idx));
  };

  const handleFillGaps = () => {
    if (sorted.length === 0) {
      onChange([{ min: 0, max: 1, action: 'quarantine' }]);
      return;
    }
    const filled: ThresholdSegment[] = [];
    let lastMax = 0;
    sorted.forEach((segment) => {
      if (segment.min > lastMax + 0.001) {
        filled.push({ ...segment, min: lastMax });
      } else {
        filled.push(segment);
      }
      lastMax = segment.max;
    });
    if (lastMax < 0.999) {
      filled[filled.length - 1] = { ...filled[filled.length - 1], max: 1 };
    }
    if (filled.length > 0 && filled[0].min > 0.001) {
      filled[0] = { ...filled[0], min: 0 };
    }
    onChange(filled);
  };

  const actionLabel = (a: IntentAction) => {
    if (a === 'accept') return tAction('mark_deliver');
    return tAction(a as 'quarantine');
  };

  const applyPreset = (preset: 'strict' | 'standard' | 'loose') => {
    const dirAcc: IntentAction = direction === 'receive' ? 'accept' : 'audit';
    let next: ThresholdSegment[];
    if (preset === 'strict') {
      next = [
        { min: 0, max: 0.3, action: 'quarantine' }, { min: 0.3, max: 0.6, action: 'reject' }, { min: 0.6, max: 1, action: 'discard' },
      ];
    } else if (preset === 'standard') {
      next = [
        { min: 0, max: 0.3, action: dirAcc }, { min: 0.3, max: 0.7, action: 'quarantine' }, { min: 0.7, max: 1, action: 'reject' },
      ];
    } else {
      next = [
        { min: 0, max: 0.5, action: dirAcc }, { min: 0.5, max: 0.8, action: 'audit' }, { min: 0.8, max: 1, action: 'quarantine' },
      ];
    }
    onChange(next);
  };

  const clamp01 = (n: number) => Math.min(1, Math.max(0, n));

  return (
    <div className="space-y-3">
      {/* 可视化条 */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>0.0</span><span>0.2</span><span>0.4</span><span>0.6</span><span>0.8</span><span>1.0</span>
        </div>
        <TooltipProvider>
          <div className="h-8 bg-muted rounded-lg overflow-hidden flex">
            {sorted.map((segment, i) => {
              const width = (segment.max - segment.min) * 100;
              return (
                <Tooltip key={i}>
                  <TooltipTrigger
                    render={
                      <div
                        className={cn(
                          'h-full flex items-center justify-center text-xs text-white font-medium cursor-help transition-[width] duration-[180ms] ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none',
                          ACTION_COLOR[segment.action] || 'bg-gray-400',
                        )}
                        style={{ width: `${width}%` }}
                      />
                    }
                  >
                    {width > 12 && actionLabel(segment.action)}
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>{`${segment.min.toFixed(2)} - ${segment.max.toFixed(2)}: ${actionLabel(segment.action)}`}</p>
                  </TooltipContent>
                </Tooltip>
              );
            })}
          </div>
        </TooltipProvider>
      </div>

      {/* 区间列表 */}
      <div className="space-y-2">
        {sorted.map((segment, i) => (
          <div key={i} className="flex items-center gap-2 text-sm">
            <span className="text-muted-foreground w-14">{t('segment')} {i + 1}:</span>
            <Input
              type="number"
              value={segment.min}
              onChange={(e) => handleSegmentChange(i, { min: clamp01(parseFloat(e.target.value) || 0) })}
              className="w-20 h-8 text-sm"
              min={0}
              max={1}
              step={0.01}
              disabled={disabled}
            />
            <span className="text-muted-foreground">-</span>
            <Input
              type="number"
              value={segment.max}
              onChange={(e) => handleSegmentChange(i, { max: clamp01(parseFloat(e.target.value) || 0) })}
              className="w-20 h-8 text-sm"
              min={0}
              max={1}
              step={0.01}
              disabled={disabled}
            />
            <Select
              value={segment.action}
              onValueChange={(v) => handleSegmentChange(i, { action: v as IntentAction })}
              disabled={disabled}
            >
              <SelectTrigger className="w-28 h-8 text-sm">
                <SelectValue>{actionLabel(segment.action)}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                {actions.map((a) => (
                  <SelectItem key={a} value={a}>
                    {actionLabel(a)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {segments.length > 1 && (
              <Button
                variant="ghost"
                size="sm"
                className="h-8 px-2 text-destructive hover:text-destructive"
                onClick={() => handleRemoveSegment(i)}
                disabled={disabled}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            )}
          </div>
        ))}
      </div>

      {/* 间隙警告 */}
      {hasGap && (
        <div className="flex items-center gap-2 p-2 bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800 rounded-lg text-sm text-amber-700 dark:text-amber-300">
          <AlertCircle className="h-4 w-4 shrink-0" />
          <span>{t('gapWarning')}</span>
        </div>
      )}

      {/* 操作按钮 */}
      <div className="flex items-center gap-2 flex-wrap">
        <Button variant="outline" size="sm" onClick={handleAddSegment} className="h-8 text-xs" disabled={disabled}>
          <Plus className="h-3.5 w-3.5 mr-1" />
          {t('addSegment')}
        </Button>
        {hasGap && (
          <Button variant="outline" size="sm" onClick={handleFillGaps} className="h-8 text-xs" disabled={disabled}>
            <CheckCircle2 className="h-3.5 w-3.5 mr-1" />
            {t('fillGaps')}
          </Button>
        )}
        {/* 受控 value=""：base-ui Select 视空串为未选中，应用模板后触发器自动回落到 placeholder（勿改成非受控+key 重置） */}
        <Select value="" onValueChange={(v) => v && applyPreset(v as 'strict' | 'standard' | 'loose')} disabled={disabled}>
          <SelectTrigger className="w-32 h-8 text-xs" data-testid="ie-preset-select">
            <SelectValue placeholder={t('applyPreset')} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="strict">{t('presetStrict')}</SelectItem>
            <SelectItem value="standard">{t('presetStandard')}</SelectItem>
            <SelectItem value="loose">{t('presetLoose')}</SelectItem>
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}
