'use client';

import { useTranslations } from 'next-intl';
import { useId } from 'react';
import type { SimilarDetectionDirectionConfig } from './types';
import { Switch } from '@/components/ui/switch';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';

interface Props {
  value: SimilarDetectionDirectionConfig;
  onChange: (patch: Partial<SimilarDetectionDirectionConfig>) => void;
  disabled?: boolean;
}

// 标记投递（action === "mark-delivery"）配置面板：主题标记 + 信头标记，
// 结构与 demo renderTagDeliveryConfig 一致（青色虚线框）。
export function TagDeliveryPanel({ value, onChange, disabled }: Props) {
  const t = useTranslations('similarDetection');
  const uid = useId();
  return (
    <div data-testid="similar-detection-tag-panel" className="space-y-4 rounded-md border border-dashed border-cyan-300 dark:border-cyan-800 bg-cyan-50/40 dark:bg-cyan-950/20 p-3">
      <div>
        <p className="text-sm font-medium">{t('tagModeTitle')}</p>
        <p className="text-xs text-muted-foreground mt-0.5">{t('tagModeHint')}</p>
      </div>
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <Switch data-testid="similar-detection-tag-subject-switch" checked={!!value.tag_subject_enabled} disabled={disabled}
            onCheckedChange={(checked) => onChange({ tag_subject_enabled: checked })} />
          <Label className="text-sm">{t('tagSubjectLabel')}</Label>
        </div>
        {value.tag_subject_enabled && (
          <div className="flex flex-wrap items-center gap-2 pl-10">
            <RadioGroup value={value.tag_subject_position || 'prefix'} disabled={disabled}
              onValueChange={(v) => onChange({ tag_subject_position: v as 'prefix' | 'suffix' })}
              className="flex items-center gap-4">
              <div className="flex items-center gap-1.5">
                <RadioGroupItem value="prefix" id={`${uid}-prefix`} />
                <Label htmlFor={`${uid}-prefix`} className="text-sm font-normal">{t('tagPositionPrefix')}</Label>
              </div>
              <div className="flex items-center gap-1.5">
                <RadioGroupItem value="suffix" id={`${uid}-suffix`} />
                <Label htmlFor={`${uid}-suffix`} className="text-sm font-normal">{t('tagPositionSuffix')}</Label>
              </div>
            </RadioGroup>
            <Input value={value.tag_subject_content || ''} disabled={disabled} placeholder={t('tagSubjectPlaceholder')}
              onChange={(e) => onChange({ tag_subject_content: e.target.value })}
              className="flex-1 min-w-[160px] h-8" data-testid="similar-detection-tag-subject-content" />
          </div>
        )}
      </div>
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <Switch data-testid="similar-detection-tag-header-switch" checked={!!value.tag_header_enabled} disabled={disabled}
            onCheckedChange={(checked) => onChange({ tag_header_enabled: checked })} />
          <Label className="text-sm">{t('tagHeaderLabel')}</Label>
        </div>
        {value.tag_header_enabled && (
          <div className="flex flex-wrap items-center gap-2 pl-10">
            <Input value={value.tag_header_name || ''} disabled={disabled} placeholder={t('tagHeaderNamePlaceholder')}
              onChange={(e) => onChange({ tag_header_name: e.target.value })} className="w-[220px] h-8" />
            <Input value={value.tag_header_value || ''} disabled={disabled} placeholder={t('tagHeaderValuePlaceholder')}
              onChange={(e) => onChange({ tag_header_value: e.target.value })} className="flex-1 min-w-[140px] h-8" />
          </div>
        )}
      </div>
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <Switch
            data-testid="similar-detection-tag-body-switch"
            checked={!!value.tag_body_enabled}
            disabled={disabled}
            onCheckedChange={(checked) => onChange({ tag_body_enabled: checked })}
          />
          <Label className="text-sm">{t('tagBodyLabel')}</Label>
        </div>
        {value.tag_body_enabled && (
          <div className="pl-10">
            <Input
              value={value.tag_body_content || ''}
              disabled={disabled}
              placeholder={t('tagBodyPlaceholder')}
              onChange={(e) => onChange({ tag_body_content: e.target.value })}
              className="h-8 w-full"
              data-testid="similar-detection-tag-body-content"
            />
          </div>
        )}
      </div>
    </div>
  );
}
