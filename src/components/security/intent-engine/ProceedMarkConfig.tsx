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

// "进行下一步"动作不再选择投递目标（固定放行到收件箱），仅保留主题/信头两行可
// 独立勾选的打标配置（Checkbox+文案+前缀/后缀），两者可同时启用。
export function ProceedMarkConfig({ value, intent, onChange, disabled }: ProceedMarkConfigProps) {
  const t = useTranslations('intentEngine.markConfig');

  const markRow = (
    kind: 'subject_mark' | 'header_mark',
    label: string,
    mark: IntentMark | undefined,
  ) => {
    const m: IntentMark = mark ?? { enabled: false, text: DEFAULT_MARK_TEXT[intent], position: 'prefix' };
    const patch = (p: Partial<IntentMark>) => onChange({ ...value, [kind]: { ...m, ...p } });
    return (
      <div className="flex items-center gap-3 flex-wrap" data-testid={`ie-${kind}-row`}>
        <Checkbox
          checked={m.enabled}
          onCheckedChange={(c) => patch({ enabled: !!c })}
          disabled={disabled}
          data-testid={`ie-${kind}-enabled`}
        />
        <Label className="text-sm">{label}</Label>
        {m.enabled && (
          <>
            <Input
              className="w-32 h-8 text-sm"
              value={m.text}
              onChange={(e) => patch({ text: e.target.value })}
              // GT-12204 / html_spec 层级6(v3)：清空并失焦时回填该意图的默认文案。
              // IntentEnginePage.handleSave 的 D-11 只在*保存时*兜底，用户在保存前
              // 看到的是空框，会误以为标记要落空；这里在失焦即回填，与 D-11 同源
              // (DEFAULT_MARK_TEXT[intent])，两处口径一致。
              onBlur={() => {
                if (!m.text.trim()) patch({ text: DEFAULT_MARK_TEXT[intent] });
              }}
              maxLength={20}
              // GT-12204 / html_spec 层级6(v3) 双重期望：清空失焦回填默认文案(见
              // onBlur)，且 placeholder 同步为该意图的默认文案(订阅类为 [订阅])，
              // 而非固定的“标记文案”，让用户在空态即可看到将落入的默认值。
              placeholder={DEFAULT_MARK_TEXT[intent]}
              disabled={disabled}
              data-testid={`ie-${kind}-text`}
            />
            <RadioGroup
              value={m.position}
              onValueChange={(v) => patch({ position: v as MarkPosition })}
              className="flex items-center gap-2"
              disabled={disabled}
            >
              <div className="flex items-center gap-1">
                <RadioGroupItem value="prefix" id={`ie-${kind}-prefix-${intent}`} data-testid={`ie-${kind}-prefix`} />
                <Label htmlFor={`ie-${kind}-prefix-${intent}`} className="text-xs cursor-pointer">{t('prefix')}</Label>
              </div>
              <div className="flex items-center gap-1">
                <RadioGroupItem value="suffix" id={`ie-${kind}-suffix-${intent}`} data-testid={`ie-${kind}-suffix`} />
                <Label htmlFor={`ie-${kind}-suffix-${intent}`} className="text-xs cursor-pointer">{t('suffix')}</Label>
              </div>
            </RadioGroup>
          </>
        )}
      </div>
    );
  };

  return (
    <div className="rounded-lg bg-info/5 border border-info/20 p-4 space-y-4" data-testid="ie-mark-config">
      <div className="text-sm font-medium text-info">{t('title')}</div>
      {markRow('subject_mark', t('subjectMark'), value.subject_mark)}
      {markRow('header_mark', t('headerMark'), value.header_mark)}
    </div>
  );
}
