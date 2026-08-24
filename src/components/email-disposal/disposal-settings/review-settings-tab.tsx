'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import {
  Controller,
  useFormState,
  type Control,
  type UseFormWatch,
  type UseFormSetValue,
} from 'react-hook-form';
import { Plus, X, Clock, Mail, Bell } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import type { DisposalSettings } from '@/types/disposal-settings';

interface Props {
  control: Control<DisposalSettings>;
  watch: UseFormWatch<DisposalSettings>;
  setValue: UseFormSetValue<DisposalSettings>;
}

// 秒粒度时段输入：<input type="time" step={1}> 正常输出即含秒（HH:MM:SS）；
// 但个别浏览器/自动化环境在用户仅输入到分钟时仍可能回填 HH:MM，这里兜底补 ':00'。
function normalizeSecondsValue(v: string): string {
  return /^\d{2}:\d{2}$/.test(v) ? `${v}:00` : v;
}

// 后端仅接受 subject_prefix/header（internal/api/disposal_settings.go 校验），
// 之前误用 subject/body 会导致整页保存 PUT 400（Task 12 审查发现的跨层缺陷）。
const MARK_POSITIONS = ['subject_prefix', 'header'] as const;

export function ReviewSettingsTab({ control, watch, setValue }: Props) {
  const t = useTranslations('disposalSettings');
  const [newEmail, setNewEmail] = useState('');

  const durationMode = watch('review.duration_mode');
  const customMinutes = watch('review.custom_minutes');
  const reviewerEmails = watch('review.reviewer_emails');
  const autoDeliverEnabled = watch('review.timeout_auto_deliver');
  const senderNotifyOnQueue = watch('review.sender_notify_on_queue');
  const senderNotifyOnResult = watch('review.sender_notify_on_result');
  const activeStart = watch('review.reviewer_active_start');
  const activeEnd = watch('review.reviewer_active_end');
  const timeoutMarkEnabled = watch('review.timeout_mark_enabled');
  const timeoutMarkPositions = watch('review.timeout_mark_positions') ?? [];

  const { errors } = useFormState({ control });
  const customMinutesError = errors.review?.custom_minutes;

  const [emailError, setEmailError] = useState('');

  // GT-12250：非法/重复邮箱此前是静默 return —— chip 不出现、输入框保留原值、
  // 没有任何提示，用户无从判断为什么没加上。改为把拒绝原因显示出来。
  const addEmail = () => {
    const trimmed = newEmail.trim();
    if (!trimmed) return;
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
      setEmailError(t('emailInvalid'));
      return;
    }
    if (reviewerEmails.includes(trimmed)) {
      setEmailError(t('emailDuplicate'));
      return;
    }
    setEmailError('');
    setValue('review.reviewer_emails', [...reviewerEmails, trimmed], { shouldDirty: true });
    setNewEmail('');
  };

  const removeEmail = (email: string) =>
    setValue('review.reviewer_emails', reviewerEmails.filter((e) => e !== email), {
      shouldDirty: true,
    });

  const toggleMarkPosition = (position: string, checked: boolean) => {
    const next = checked
      ? [...timeoutMarkPositions.filter((p) => p !== position), position]
      : timeoutMarkPositions.filter((p) => p !== position);
    setValue('review.timeout_mark_positions', next, { shouldDirty: true });
  };

  return (
    <div className="space-y-6">
      <Card className="p-6 space-y-6">
        <div className="flex items-center gap-2">
          <Clock className="h-5 w-5 text-muted-foreground" />
          <h2 className="text-lg font-semibold">{t('periodAndTimeout')}</h2>
        </div>

        <div className="space-y-4">
          <div>
            <h3 className="font-medium">{t('durationControl')}</h3>
          </div>
          <Controller
            control={control}
            name="review.duration_mode"
            render={({ field }) => (
              <div className="space-y-3">
                <label className="flex items-center gap-3">
                  <input
                    type="radio"
                    checked={field.value === 'unlimited'}
                    onChange={() => field.onChange('unlimited')}
                    data-testid="disposal-settings-duration-unlimited"
                  />
                  <span className="text-sm">{t('duration_unlimited')}</span>
                </label>
                <label className="flex items-center gap-3">
                  <input
                    type="radio"
                    checked={field.value === 'custom'}
                    onChange={() => field.onChange('custom')}
                    data-testid="disposal-settings-duration-custom"
                  />
                  <span className="text-sm">{t('duration_custom')}</span>
                </label>
              </div>
            )}
          />

          {durationMode === 'custom' && (
            <div className="flex items-center gap-2 pl-7">
              <Controller
                control={control}
                name="review.custom_minutes"
                render={({ field, fieldState }) => (
                  <Input
                    type="number"
                    min={1}
                    max={300}
                    className="w-28"
                    value={field.value}
                    aria-invalid={fieldState.error ? true : undefined}
                    onChange={(e) => field.onChange(parseInt(e.target.value, 10) || 0)}
                    data-testid="disposal-settings-custom-minutes"
                  />
                )}
              />
              <span className="text-sm text-muted-foreground">{t('minutes')}</span>
              <span
                className="text-xs text-muted-foreground ml-2"
                data-testid="disposal-settings-custom-minutes-current"
              >
                {t('currentSetting', { minutes: customMinutes })}
              </span>
              {/* GT-12251：schema 会拒绝 1-300 之外的值，但此前没有任何地方渲染
                  formState.errors —— 点保存后 handleSubmit 静默不执行，用户看不到
                  原因。这里把范围错误显示出来。 */}
              {customMinutesError && (
                <p
                  className="w-full text-sm text-destructive"
                  role="alert"
                  data-testid="disposal-settings-custom-minutes-error"
                >
                  {t('customMinutesRange')}
                </p>
              )}
            </div>
          )}
        </div>

        <div className="space-y-3">
          <div className="flex items-center justify-between rounded-lg border p-4">
            <div>
              <div className="font-medium">{t('timeoutAutoDeliver')}</div>
              <div className="text-sm text-muted-foreground">{t('autoDeliverDesc')}</div>
            </div>
            <Controller
              control={control}
              name="review.timeout_auto_deliver"
              render={({ field }) => (
                <Switch
                  checked={field.value}
                  onCheckedChange={field.onChange}
                  data-testid="disposal-settings-auto-deliver"
                />
              )}
            />
          </div>
          <p className="text-xs text-muted-foreground ml-4" data-testid="disposal-settings-auto-deliver-status">
            {t('currentStatus')}
            {autoDeliverEnabled ? t('statusEnabled') : t('statusDisabled')}
          </p>
        </div>

        <div className="space-y-3">
          <Controller
            control={control}
            name="review.max_recheck_minutes"
            render={({ field }) => (
              <div className="space-y-2">
                <Label>{t('maxRecheckMinutes')}</Label>
                <Input
                  type="number"
                  min={1}
                  max={60}
                  className="w-32"
                  value={field.value}
                  onChange={(e) => field.onChange(parseInt(e.target.value, 10) || 0)}
                  data-testid="disposal-settings-max-recheck-minutes"
                />
              </div>
            )}
          />
        </div>

        <div className="space-y-3">
          <Label className="font-medium">{t('timeoutTempDisposal')}</Label>
          <div
            className="rounded-md border bg-muted/30 px-3 py-2 text-sm"
            data-testid="disposal-settings-timeout-disposal-accept"
          >
            {t('timeoutDisposal_accept')}
          </div>

          <div className="ml-6 space-y-4">
            <div className="flex items-center justify-between rounded-md border p-3">
              <Label className="font-normal">{t('timeoutMarkEnabled')}</Label>
              <Switch
                checked={timeoutMarkEnabled}
                onCheckedChange={(checked) =>
                  setValue('review.timeout_mark_enabled', checked, { shouldDirty: true })
                }
                data-testid="disposal-settings-timeout-mark-enabled"
              />
            </div>
            {timeoutMarkEnabled ? (
              <>
                <div
                  className="space-y-2"
                  data-testid="disposal-settings-timeout-mark-positions"
                >
                  <Label className="text-sm text-muted-foreground">
                    {t('timeoutMarkPositions')}
                  </Label>
                  <div className="flex gap-4">
                    {MARK_POSITIONS.map((position) => (
                      <label key={position} className="flex items-center gap-2">
                        <Checkbox
                          checked={timeoutMarkPositions.includes(position)}
                          onCheckedChange={(c) => toggleMarkPosition(position, c === true)}
                          data-testid={`disposal-settings-timeout-mark-positions-${position}`}
                        />
                        <span className="text-sm">
                          {position === 'subject_prefix'
                            ? t('markPosition_subject_prefix')
                            : t('markPosition_header')}
                        </span>
                      </label>
                    ))}
                  </div>
                </div>

                <Controller
                  control={control}
                  name="review.timeout_mark_text"
                  render={({ field }) => (
                    <div className="space-y-2">
                      <Label className="text-sm text-muted-foreground">
                        {t('timeoutMarkText')}
                      </Label>
                      <Input
                        value={field.value ?? ''}
                        onChange={(e) => field.onChange(e.target.value)}
                        data-testid="disposal-settings-timeout-mark-text"
                      />
                    </div>
                  )}
                />
              </>
            ) : null}
          </div>
        </div>
      </Card>

      <Card className="p-6 space-y-6">
        <div className="flex items-center gap-2">
          <Mail className="h-5 w-5 text-muted-foreground" />
          <h2 className="text-lg font-semibold">{t('senderNotification')}</h2>
        </div>

        <div className="space-y-3">
          <div className="flex items-center justify-between rounded-lg border p-4">
            <div>
              <div className="font-medium">{t('queueEntryNotify')}</div>
              <div className="text-sm text-muted-foreground">{t('queueEntryDesc')}</div>
            </div>
            <Controller
              control={control}
              name="review.sender_notify_on_queue"
              render={({ field }) => (
                <Switch
                  checked={field.value}
                  onCheckedChange={field.onChange}
                  data-testid="disposal-settings-sender-queue"
                />
              )}
            />
          </div>
          <p className="text-xs text-muted-foreground ml-4" data-testid="disposal-settings-sender-queue-status">
            {t('currentStatus')}
            {senderNotifyOnQueue ? t('statusEnabled') : t('statusDisabled')}
          </p>
        </div>

        <div className="space-y-3">
          <div className="flex items-center justify-between rounded-lg border p-4">
            <div>
              <div className="font-medium">{t('resultNotify')}</div>
              <div className="text-sm text-muted-foreground">{t('resultNotifyDesc')}</div>
            </div>
            <Controller
              control={control}
              name="review.sender_notify_on_result"
              render={({ field }) => (
                <Switch
                  checked={field.value}
                  onCheckedChange={field.onChange}
                  data-testid="disposal-settings-sender-result"
                />
              )}
            />
          </div>
          <p className="text-xs text-muted-foreground ml-4" data-testid="disposal-settings-sender-result-status">
            {t('currentStatus')}
            {senderNotifyOnResult ? t('statusEnabled') : t('statusDisabled')}
          </p>
        </div>
      </Card>

      <Card className="p-6 space-y-6">
        <div className="flex items-center gap-2">
          <Bell className="h-5 w-5 text-muted-foreground" />
          <h2 className="text-lg font-semibold">{t('reviewerNotification')}</h2>
        </div>

        <div className="space-y-4">
          <div>
            <Label>{t('receiverEmail')}</Label>
            <div className="mt-2 flex gap-2">
              <Input
                value={newEmail}
                onChange={(e) => {
                  setNewEmail(e.target.value);
                  if (emailError) setEmailError('');
                }}
                aria-invalid={emailError ? true : undefined}
                placeholder={t('enterEmailAddress')}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    addEmail();
                  }
                }}
                data-testid="disposal-settings-reviewer-email-input"
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={addEmail}
                data-testid="disposal-settings-reviewer-email-add"
              >
                <Plus className="h-4 w-4 mr-1" />
                {t('add')}
              </Button>
            </div>
            {emailError && (
              <p
                className="mt-1 text-sm text-destructive"
                role="alert"
                data-testid="disposal-settings-reviewer-email-error"
              >
                {emailError}
              </p>
            )}
          </div>

          {reviewerEmails.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {reviewerEmails.map((email) => (
                <span
                  key={email}
                  className="flex items-center gap-2 rounded-md bg-blue-50 px-3 py-1.5 text-sm text-blue-700 dark:bg-blue-900/30 dark:text-blue-300"
                  data-testid={`disposal-settings-reviewer-email-chip-${email}`}
                >
                  {email}
                  <button type="button" onClick={() => removeEmail(email)}>
                    <X className="h-4 w-4" />
                  </button>
                </span>
              ))}
            </div>
          )}

          <div className="space-y-2">
            <Label>{t('notifyInterval')}</Label>
            <Controller
              control={control}
              name="review.reviewer_notify_interval_minutes"
              render={({ field }) => (
                <Input
                  type="number"
                  min={1}
                  max={1440}
                  className="w-32"
                  value={field.value}
                  onChange={(e) => field.onChange(parseInt(e.target.value, 10) || 0)}
                  data-testid="disposal-settings-notify-interval"
                />
              )}
            />
            <p className="text-xs text-muted-foreground">{t('intervalHint')}</p>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>{t('startTime')}</Label>
              <Controller
                control={control}
                name="review.reviewer_active_start"
                render={({ field }) => (
                  <Input
                    type="time"
                    step={1}
                    value={field.value}
                    onChange={(e) => field.onChange(normalizeSecondsValue(e.target.value))}
                    data-testid="disposal-settings-active-start"
                  />
                )}
              />
            </div>
            <div className="space-y-2">
              <Label>{t('endTime')}</Label>
              <Controller
                control={control}
                name="review.reviewer_active_end"
                render={({ field }) => (
                  <Input
                    type="time"
                    step={1}
                    value={field.value}
                    onChange={(e) => field.onChange(normalizeSecondsValue(e.target.value))}
                    data-testid="disposal-settings-active-end"
                  />
                )}
              />
            </div>
          </div>
          <p className="text-xs text-muted-foreground" data-testid="disposal-settings-active-period-current">
            {t('currentPeriod', { start: activeStart, end: activeEnd })}
          </p>
        </div>
      </Card>
    </div>
  );
}
