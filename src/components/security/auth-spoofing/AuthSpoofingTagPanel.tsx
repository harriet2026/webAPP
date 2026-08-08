'use client';

import { useTranslations } from 'next-intl';
import { useId } from 'react';
import { Switch } from '@/components/ui/switch';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';

export interface TagPanelValue {
  tag_subject_enabled?: boolean;
  tag_subject_position?: 'prefix' | 'suffix';
  tag_subject_content?: string;
  tag_header_enabled?: boolean;
  tag_header_name?: string;
  tag_header_value?: string;
  tag_body_enabled?: boolean;
  tag_body_content?: string;
}

interface AuthSpoofingTagPanelProps {
  value: TagPanelValue;
  onChange: (patch: Partial<TagPanelValue>) => void;
  disabled?: boolean;
}

// "进行下一步"（action === "mark-delivery"）的附加标记策略面板：支持主题、
// 信头、正文三种标记方式，视觉与结构对齐相似检测模块的 TagDeliveryPanel
// （青色虚线框），保持系统内"标记策略"组件的一致性。
export function AuthSpoofingTagPanel({ value, onChange, disabled }: AuthSpoofingTagPanelProps) {
  const t = useTranslations('authSpoofing.tagPanel');
  const uid = useId();

  return (
    <div
      data-testid="auth-spoofing-tag-panel"
      className="space-y-4 rounded-md border border-dashed border-cyan-300 dark:border-cyan-800 bg-cyan-50/40 dark:bg-cyan-950/20 p-3"
    >
      <div>
        <p className="text-sm font-medium">{t('title')}</p>
        <p className="text-xs text-muted-foreground mt-0.5">{t('hint')}</p>
      </div>

      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <Switch
            checked={!!value.tag_subject_enabled}
            disabled={disabled}
            onCheckedChange={(checked) => onChange({ tag_subject_enabled: checked })}
          />
          <Label className="text-sm">{t('subjectLabel')}</Label>
        </div>
        {value.tag_subject_enabled && (
          <div className="flex flex-wrap items-center gap-2 pl-10">
            <RadioGroup
              value={value.tag_subject_position || 'prefix'}
              disabled={disabled}
              onValueChange={(v) => onChange({ tag_subject_position: v as 'prefix' | 'suffix' })}
              className="flex items-center gap-4"
            >
              <div className="flex items-center gap-1.5">
                <RadioGroupItem value="prefix" id={`${uid}-prefix`} />
                <Label htmlFor={`${uid}-prefix`} className="text-sm font-normal">
                  {t('subjectPositionPrefix')}
                </Label>
              </div>
              <div className="flex items-center gap-1.5">
                <RadioGroupItem value="suffix" id={`${uid}-suffix`} />
                <Label htmlFor={`${uid}-suffix`} className="text-sm font-normal">
                  {t('subjectPositionSuffix')}
                </Label>
              </div>
            </RadioGroup>
            <Input
              value={value.tag_subject_content || ''}
              disabled={disabled}
              placeholder={t('subjectPlaceholder')}
              onChange={(e) => onChange({ tag_subject_content: e.target.value })}
              className="flex-1 min-w-[160px] h-8"
            />
          </div>
        )}
      </div>

      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <Switch
            checked={!!value.tag_header_enabled}
            disabled={disabled}
            onCheckedChange={(checked) => onChange({ tag_header_enabled: checked })}
          />
          <Label className="text-sm">{t('headerLabel')}</Label>
        </div>
        {value.tag_header_enabled && (
          <div className="flex flex-wrap items-center gap-2 pl-10">
            <Input
              value={value.tag_header_name || ''}
              disabled={disabled}
              placeholder={t('headerNamePlaceholder')}
              onChange={(e) => onChange({ tag_header_name: e.target.value })}
              className="w-[220px] h-8"
            />
            <Input
              value={value.tag_header_value || ''}
              disabled={disabled}
              placeholder={t('headerValuePlaceholder')}
              onChange={(e) => onChange({ tag_header_value: e.target.value })}
              className="flex-1 min-w-[140px] h-8"
            />
          </div>
        )}
      </div>

      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <Switch
            checked={!!value.tag_body_enabled}
            disabled={disabled}
            onCheckedChange={(checked) => onChange({ tag_body_enabled: checked })}
          />
          <Label className="text-sm">{t('bodyLabel')}</Label>
        </div>
        {value.tag_body_enabled && (
          <div className="pl-10">
            <Input
              value={value.tag_body_content || ''}
              disabled={disabled}
              placeholder={t('bodyPlaceholder')}
              onChange={(e) => onChange({ tag_body_content: e.target.value })}
              className="h-8 w-full"
            />
          </div>
        )}
      </div>
    </div>
  );
}
