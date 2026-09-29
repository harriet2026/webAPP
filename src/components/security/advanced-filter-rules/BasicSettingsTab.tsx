'use client';

import { useTranslations } from 'next-intl';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { cn } from '@/lib/utils';
import type { RuleForm, Scope } from './rule-form';
import type { PriorityRange } from './priority-range';

const DESCRIPTION_MAX = 500;

// GT-12181: fallback range only for callers that don't inject a role-aware one.
// The editor always passes the logged-in role's range (tenant 100-1000).
const FALLBACK_PRIORITY_RANGE: PriorityRange = { min: 100, max: 1000, defaultValue: 600 };

const SCOPE_OPTIONS: Scope[] = ['incoming', 'outgoing', 'internal'];

export interface BasicSettingsErrors {
  name: boolean;
  scope: boolean;
  priority?: boolean;
}

interface Props {
  form: RuleForm;
  setForm: (updater: (f: RuleForm) => RuleForm) => void;
  errors?: BasicSettingsErrors;
  priorityRange?: PriorityRange;
}

export function BasicSettingsTab({ form, setForm, errors, priorityRange }: Props) {
  const t = useTranslations('advancedRulesFeature');
  const range = priorityRange ?? FALLBACK_PRIORITY_RANGE;

  const nameError = !!errors?.name;
  const scopeError = !!errors?.scope;
  const priorityError = !!errors?.priority;

  const scopeLabel = (s: Scope) => {
    if (s === 'incoming') return t('scopeIncoming');
    if (s === 'outgoing') return t('scopeOutgoing');
    return t('scopeInternal');
  };

  return (
    <div className="space-y-6" data-testid="basic-settings-tab">
      {/* 基础信息 */}
      <section className="space-y-4">
        <h3 className="text-sm font-semibold">{t('basic.sectionBasicInfo')}</h3>
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="basic-name">
              {t('name')} <span className="text-destructive">*</span>
            </Label>
            <Input
              id="basic-name"
              data-testid="basic-name"
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              placeholder={t('basic.namePlaceholder')}
              className={cn(nameError && 'border-destructive focus-visible:ring-destructive')}
            />
            {nameError && (
              <p className="text-xs text-destructive" data-testid="basic-name-error">
                {t('errors.nameRequired')}
              </p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="basic-priority">
              {t('priority')} <span className="text-destructive">*</span>
            </Label>
            <Input
              id="basic-priority"
              data-testid="basic-priority"
              type="number"
              min={range.min}
              max={range.max}
              value={form.priority}
              onChange={(e) => {
                const n = Number(e.target.value);
                setForm((f) => ({ ...f, priority: Number.isFinite(n) ? n : range.defaultValue }));
              }}
              className={cn(priorityError && 'border-destructive focus-visible:ring-destructive')}
            />
            {priorityError ? (
              <p className="text-xs text-destructive" data-testid="basic-priority-error">
                {t('errors.priorityRange', { min: range.min, max: range.max })}
              </p>
            ) : (
              <p className="text-xs text-muted-foreground">
                {t('priorityHint', { min: range.min, max: range.max })}
              </p>
            )}
          </div>
        </div>

        <div className="space-y-2">
          <Label>{t('status')}</Label>
          <RadioGroup
            value={form.enabled ? 'enabled' : 'disabled'}
            onValueChange={(v) => setForm((f) => ({ ...f, enabled: v === 'enabled' }))}
            className="flex gap-4"
          >
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <RadioGroupItem value="enabled" data-testid="basic-status-enabled" />
              {t('enabled')}
            </label>
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <RadioGroupItem value="disabled" data-testid="basic-status-disabled" />
              {t('disabled')}
            </label>
          </RadioGroup>
        </div>
      </section>

      {/* 生效范围 */}
      <section className="space-y-2">
        <h3 className="text-sm font-semibold">{t('basic.sectionScope')}</h3>
        <Label>
          {t('scopeLabel')} <span className="text-destructive">*</span>
        </Label>
        <div className="flex gap-4">
          {SCOPE_OPTIONS.map((s) => {
            const checked = form.scope.includes(s);
            return (
              <label
                key={s}
                data-testid={`scope-${s}-label`}
                className="flex items-center gap-2 text-sm cursor-pointer"
              >
                <Checkbox
                  data-testid={`scope-${s}`}
                  checked={checked}
                  onCheckedChange={(v) => {
                    if (v) {
                      setForm((f) => ({ ...f, scope: [...f.scope, s] }));
                    } else {
                      setForm((f) => ({ ...f, scope: f.scope.filter((x) => x !== s) }));
                    }
                  }}
                />
                {scopeLabel(s)}
              </label>
            );
          })}
        </div>
        {scopeError && (
          <p className="text-xs text-destructive" data-testid="basic-scope-error">
            {t('errors.scopeRequired')}
          </p>
        )}
      </section>

      {/* 有效期设置 */}
      <section className="space-y-2">
        <h3 className="text-sm font-semibold">{t('basic.sectionValidity')}</h3>
        <div className="space-y-2 max-w-[220px]">
          <Label htmlFor="basic-valid-until">{t('expiresAt')}</Label>
          <Input
            id="basic-valid-until"
            data-testid="basic-valid-until"
            type="date"
            value={form.validUntil ?? ''}
            onChange={(e) => setForm((f) => ({ ...f, validUntil: e.target.value || null }))}
          />
          <p className="text-xs text-muted-foreground">{t('basic.expiresAtHint')}</p>
        </div>
      </section>

      {/* 备注说明 */}
      <section className="space-y-2">
        <h3 className="text-sm font-semibold">{t('basic.sectionDescription')}</h3>
        <div className="space-y-2">
          <Label htmlFor="basic-description">{t('basic.descriptionLabel')}</Label>
          <Textarea
            id="basic-description"
            data-testid="basic-description"
            value={form.description}
            onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
            rows={3}
            maxLength={DESCRIPTION_MAX}
            placeholder={t('basic.descriptionPlaceholder')}
          />
          <p className="text-right text-xs text-muted-foreground" data-testid="basic-description-count">
            {t('basic.charCount', { count: form.description.length, max: DESCRIPTION_MAX })}
          </p>
        </div>
      </section>
    </div>
  );
}
