'use client';

import { useTranslations } from 'next-intl';
import type { IntentMarkConfig, IntentMark, IntentType, MarkPosition } from '@/types/intent-engine';
import { DEFAULT_MARK_TEXT } from '@/types/intent-engine';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';

interface ProceedMarkConfigProps {
  value: IntentMarkConfig;
  intent: IntentType;
  onChange: (next: IntentMarkConfig) => void;
  disabled?: boolean;
}

const DEFAULT_HEADER_NAME = 'X-OSG-Intent';

export function ProceedMarkConfig({ value, intent, onChange, disabled }: ProceedMarkConfigProps) {
  const t = useTranslations('intentEngine.markConfig');
  const defaultText = DEFAULT_MARK_TEXT[intent];
  const subject: IntentMark = value.subject_mark ?? {
    enabled: false,
    text: defaultText,
    position: 'prefix',
  };
  const header = value.header_mark ?? {
    enabled: false,
    name: DEFAULT_HEADER_NAME,
    value: defaultText,
  };

  const patchSubject = (patch: Partial<IntentMark>) => {
    onChange({ ...value, subject_mark: { ...subject, ...patch } });
  };
  const patchHeader = (patch: Partial<typeof header>) => {
    onChange({ ...value, header_mark: { ...header, ...patch } });
  };

  return (
    <div className="rounded-lg bg-info/5 border border-info/20 p-4 space-y-4" data-testid="ie-mark-config">
      <div className="text-sm font-medium text-info">{t('title')}</div>

      <div className="flex items-center gap-3 flex-wrap" data-testid="ie-subject_mark-row">
        <Checkbox
          checked={subject.enabled}
          onCheckedChange={(checked) => patchSubject({ enabled: !!checked })}
          disabled={disabled}
          data-testid="ie-subject_mark-enabled"
        />
        <Label className="text-sm">{t('subjectMark')}</Label>
        {subject.enabled && (
          <>
            <Input
              className="w-32 h-8 text-sm"
              value={subject.text}
              onChange={(event) => patchSubject({ text: event.target.value })}
              onBlur={() => {
                if (!subject.text.trim()) patchSubject({ text: defaultText });
              }}
              maxLength={20}
              placeholder={defaultText}
              disabled={disabled}
              data-testid="ie-subject_mark-text"
            />
            <RadioGroup
              value={subject.position}
              onValueChange={(position) => patchSubject({ position: position as MarkPosition })}
              className="flex items-center gap-2"
              disabled={disabled}
            >
              <div className="flex items-center gap-1">
                <RadioGroupItem value="prefix" id={`ie-subject-prefix-${intent}`} />
                <Label htmlFor={`ie-subject-prefix-${intent}`} className="text-xs cursor-pointer">{t('prefix')}</Label>
              </div>
              <div className="flex items-center gap-1">
                <RadioGroupItem value="suffix" id={`ie-subject-suffix-${intent}`} />
                <Label htmlFor={`ie-subject-suffix-${intent}`} className="text-xs cursor-pointer">{t('suffix')}</Label>
              </div>
            </RadioGroup>
          </>
        )}
      </div>

      <div className="flex items-center gap-3 flex-wrap" data-testid="ie-header_mark-row">
        <Checkbox
          checked={header.enabled}
          onCheckedChange={(checked) => patchHeader({ enabled: !!checked })}
          disabled={disabled}
          data-testid="ie-header_mark-enabled"
        />
        <Label className="text-sm">{t('headerMark')}</Label>
        {header.enabled && (
          <>
            <Input
              className="w-44 h-8 text-sm"
              value={header.name}
              onChange={(event) => patchHeader({ name: event.target.value })}
              onBlur={() => {
                if (!header.name.trim()) patchHeader({ name: DEFAULT_HEADER_NAME });
              }}
              placeholder={t('headerName')}
              disabled={disabled}
              data-testid="ie-header_mark-name"
            />
            <Input
              className="w-36 h-8 text-sm"
              value={header.value}
              onChange={(event) => patchHeader({ value: event.target.value })}
              onBlur={() => {
                if (!header.value.trim()) patchHeader({ value: defaultText });
              }}
              placeholder={t('headerValue')}
              disabled={disabled}
              data-testid="ie-header_mark-value"
            />
          </>
        )}
      </div>
    </div>
  );
}
