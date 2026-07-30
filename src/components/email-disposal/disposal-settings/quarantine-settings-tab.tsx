'use client';

import { useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Controller, type Control, type UseFormWatch, type UseFormSetValue } from 'react-hook-form';
import { AlertTriangle, Plus, Users, X } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Checkbox } from '@/components/ui/checkbox';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import type { CategoryNotifyEntry, DisposalSettings } from '@/types/disposal-settings';
import {
  CATEGORY_DISPLAY_ORDER,
  DISPOSAL_PERMISSION_KEYS,
  MALICIOUS_CATEGORY_KEYS,
} from '@/types/disposal-settings';
import { getBrowserTz } from '@/lib/timezone';
import { NotificationScopeSelector } from './notification-scope-selector';

// 恶意类=红、灰邮件类=灰橙（与 demo getMailTypeColor 语义一致，附暗色变体）。
const categoryBadgeCls = (key: string) =>
  MALICIOUS_CATEGORY_KEYS.has(key)
    ? 'bg-red-50 text-red-700 border-red-200 dark:bg-red-900/30 dark:text-red-300 dark:border-red-800'
    : 'bg-orange-50 text-orange-700 border-orange-200 dark:bg-orange-900/30 dark:text-orange-300 dark:border-orange-800';

interface Props {
  control: Control<DisposalSettings>;
  watch: UseFormWatch<DisposalSettings>;
  setValue: UseFormSetValue<DisposalSettings>;
  serverTz: string;
}

// 分类置信度分数输入框：单一数据源=RHF 的 entry 值（无独立 ref 缓存"最近合法值"）。
// 本地 `text` 只是"编辑中文本"的暂存态，仅在聚焦期间作为展示值；失焦时展示值
// 直接派生自 form 的 value（自然跟随 form.reset 等外部写入，无需 effect 同步）：
// - onFocus：把当前 form 值拷入编辑暂存。
// - onChange：能解析成有限数就立刻写回 form（此时不 clamp，允许中途出现越界的
//   过渡态，例如逐字符输入 "1.5"）；不能解析（如清空）只更新暂存，不写 form。
// - onBlur：不能解析 → 回退为「当前 form 值 clamp 到 [0,1] 后」的结果——
//   同时兼顾"跟随外部写入、不恢复到过期/硬编码默认值"与"不把 onChange 阶段
//   暂存的越界值直接放行"两点；能解析 → clamp 到 [0,1] 后写回 form。
function ScoreField({
  value,
  onCommit,
  testId,
}: {
  value: number;
  onCommit: (next: number) => void;
  testId: string;
}) {
  const [text, setText] = useState('');
  const [isFocused, setIsFocused] = useState(false);
  const display = isFocused ? text : Number.isNaN(value) ? '' : String(value);

  return (
    <Input
      type="number"
      min={0}
      max={1}
      step={0.01}
      data-testid={testId}
      value={display}
      onFocus={() => {
        setIsFocused(true);
        setText(Number.isNaN(value) ? '' : String(value));
      }}
      onChange={(e) => {
        const raw = e.target.value;
        setText(raw);
        const parsed = raw === '' ? NaN : Number(raw);
        if (Number.isFinite(parsed)) {
          onCommit(parsed);
        }
      }}
      onBlur={() => {
        setIsFocused(false);
        const parsed = text === '' ? NaN : Number(text);
        if (!Number.isFinite(parsed)) {
          // 无法解析：回退到当前 form 值（单一数据源），而非任何本地缓存。
          // 仍需 clamp：onChange 阶段允许越界值暂存进 form（不打断输入过程），
          // 若那正是回退目标，这里必须再 clamp 一次，否则越界值会经由
          // change('5') → change('') → blur 这条路径绕过 clamp 直接显示出来。
          const fallback = Number.isNaN(value) ? 0 : Math.min(1, Math.max(0, value));
          if (fallback !== value) {
            onCommit(fallback);
          }
          return;
        }
        const clamped = Math.min(1, Math.max(0, parsed));
        onCommit(clamped);
      }}
    />
  );
}

export function QuarantineSettingsTab({ control, watch, setValue, serverTz }: Props) {
  const t = useTranslations('disposalSettings');
  const [newHour, setNewHour] = useState('09');
  const [newMinute, setNewMinute] = useState('00');

  const [tzAcked, setTzAcked] = useState(false);

  // 通知模式：'all'=全员（默认），'specified'=指定范围
  // 初始值派生自当前表单数据：若已有选中组/部门则默认为 specified，否则为 all。
  // 使用 useMemo 仅在组件首次挂载时计算初始值，后续由用户交互控制。
  const recipientGroupIdsInit = watch('quarantine.recipient_group_ids');
  const departmentPathsInit = watch('quarantine.department_paths');
  const initialMode = useMemo(
    () =>
      recipientGroupIdsInit.length > 0 || departmentPathsInit.length > 0
        ? 'specified'
        : 'all',
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );
  const [notifyMode, setNotifyMode] = useState<'all' | 'specified'>(initialMode);

  const handleNotifyModeChange = (mode: 'all' | 'specified') => {
    setNotifyMode(mode);
    if (mode === 'all') {
      // 切换为全员时清空已选范围
      setValue('quarantine.recipient_group_ids', [], { shouldDirty: true });
      setValue('quarantine.department_paths', [], { shouldDirty: true });
    }
  };
  const browserTz = getBrowserTz();
  const savedTz = watch('tz') || '';
  const effectiveTz = savedTz || serverTz;
  const showTzBanner = !tzAcked && !!browserTz && !!effectiveTz && effectiveTz !== browserTz;

  const chooseTz = (tz: string) => {
    setValue('tz', tz, { shouldDirty: true });
    setTzAcked(true);
  };

  const frequency = watch('quarantine.notify_frequency');
  const notifyTimes = watch('quarantine.notify_times');
  const customWeekdays = watch('quarantine.custom_weekdays');
  const recipientGroupIds = watch('quarantine.recipient_group_ids');
  const departmentPaths = watch('quarantine.department_paths');

  const addTime = () => {
    const combined = `${newHour}:${newMinute}`;
    if (!notifyTimes.includes(combined)) {
      setValue(
        'quarantine.notify_times',
        [...notifyTimes, combined].sort(),
        { shouldDirty: true },
      );
    }
  };
  const removeTime = (t: string) =>
    setValue(
      'quarantine.notify_times',
      notifyTimes.filter((x) => x !== t),
      { shouldDirty: true },
    );

  const toggleWeekday = (d: number) => {
    const next = customWeekdays.includes(d)
      ? customWeekdays.filter((x) => x !== d)
      : [...customWeekdays, d].sort((a, b) => a - b);
    setValue('quarantine.custom_weekdays', next, { shouldDirty: true });
  };

  return (
    <div className="space-y-6">
      <Card className="p-6 space-y-8">
        <h2 className="text-lg font-semibold">{t('notificationSettings')}</h2>

        <div className="space-y-2">
          <p className="text-sm text-muted-foreground" data-testid="tz-computed-line">
            {t('tzComputedIn', { tz: effectiveTz })}
          </p>
          {showTzBanner && (
            <div
              data-testid="tz-mismatch-banner"
              className="rounded-lg border border-amber-300 bg-amber-50 p-4 dark:border-amber-800 dark:bg-amber-900/20"
            >
              <p className="text-sm text-amber-800 dark:text-amber-200">
                {t('tzMismatchHint', { browserTz, effectiveTz })}
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  data-testid="tz-use-browser"
                  onClick={() => chooseTz(browserTz)}
                >
                  {t('tzUseBrowser', { tz: browserTz })}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  data-testid="tz-keep-current"
                  onClick={() => chooseTz(effectiveTz)}
                >
                  {t('tzKeepCurrent', { tz: effectiveTz })}
                </Button>
              </div>
            </div>
          )}
        </div>

        <div className="space-y-4">
          <div>
            <h3 className="font-medium">{t('classificationControl')}</h3>
          </div>
          <div
            data-testid="disposal-settings-score-hint"
            className="flex items-start gap-2 rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm text-blue-700 dark:border-blue-800 dark:bg-blue-900/20 dark:text-blue-300"
          >
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{t('scoreHint')}</span>
          </div>
          <div className="overflow-hidden rounded-lg border" data-testid="disposal-settings-category-list">
            <table className="w-full text-sm">
              <thead className="bg-muted/50">
                <tr>
                  <th className="px-3 py-2.5 text-left font-medium text-muted-foreground w-8"></th>
                  <th className="px-3 py-2.5 text-left font-medium text-muted-foreground">{t('category')}</th>
                  <th className="px-3 py-2.5 text-left font-medium text-muted-foreground w-36">{t('minConfidenceScore')}</th>
                  <th className="px-3 py-2.5 text-left font-medium text-muted-foreground w-36">{t('maxConfidenceScore')}</th>
                  <th className="px-3 py-2.5 text-right font-medium text-muted-foreground w-20">{t('notifyStatus')}</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {CATEGORY_DISPLAY_ORDER.map((key) => (
                  <Controller
                    key={key}
                    control={control}
                    name={`quarantine.category_notify.${key}` as const}
                    render={({ field, fieldState }) => {
                      const entry: CategoryNotifyEntry = field.value;
                      return (
                        <tr
                          data-testid={`disposal-settings-category-row-${key}`}
                          className={entry.enabled ? '' : 'opacity-60'}
                        >
                          <td className="px-3 py-2.5">
                            <Checkbox
                              checked={entry.enabled}
                              onCheckedChange={(c) => field.onChange({ ...entry, enabled: !!c })}
                              data-testid={`disposal-settings-category-checkbox-${key}`}
                            />
                          </td>
                          <td className="px-3 py-2.5">
                            <span
                              className={`inline-flex items-center rounded border px-2 py-0.5 text-xs font-medium ${categoryBadgeCls(key)}`}
                            >
                              {t(`category_${key}` as const)}
                            </span>
                          </td>
                          <td className="px-3 py-2.5">
                            <div className="space-y-1">
                              <ScoreField
                                testId={`disposal-settings-category-min-${key}`}
                                value={entry.min_score}
                                onCommit={(v) => field.onChange({ ...entry, min_score: v })}
                              />
                              {fieldState.error && (
                                <p className="text-xs text-destructive">{t('scoreRangeError')}</p>
                              )}
                            </div>
                          </td>
                          <td className="px-3 py-2.5">
                            <ScoreField
                              testId={`disposal-settings-category-max-${key}`}
                              value={entry.max_score}
                              onCommit={(v) => field.onChange({ ...entry, max_score: v })}
                            />
                          </td>
                          <td className="px-3 py-2.5 text-right">
                            <span className={entry.enabled ? 'text-foreground' : 'text-muted-foreground'}>
                              {entry.enabled ? t('notify') : t('noNotify')}
                            </span>
                          </td>
                        </tr>
                      );
                    }}
                  />
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="space-y-4">
          <h3 className="font-medium">{t('policyConfig')}</h3>
          <div className="space-y-2">
            <Label>{t('frequency')}</Label>
            <Controller
              control={control}
              name="quarantine.notify_frequency"
              render={({ field }) => (
                <Select value={field.value} onValueChange={field.onChange}>
                  <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="daily">{t('freq_daily')}</SelectItem>
                    <SelectItem value="never">{t('freq_never')}</SelectItem>
                    <SelectItem value="custom">{t('freq_custom')}</SelectItem>
                  </SelectContent>
                </Select>
              )}
            />
          </div>

          {frequency === 'custom' && (
            <div className="space-y-2">
              <Label>{t('weekdays')}</Label>
              <div className="flex flex-wrap gap-3">
                {[0, 1, 2, 3, 4, 5, 6].map((d) => (
                  <label key={d} className="flex items-center gap-2">
                    <Checkbox
                      checked={customWeekdays.includes(d)}
                      onCheckedChange={() => toggleWeekday(d)}
                    />
                    <span className="text-sm">{t(`weekday_${d}`)}</span>
                  </label>
                ))}
              </div>
            </div>
          )}

          {frequency !== 'never' && (
            <div className="space-y-3">
              <Label>{t('timePoints')}</Label>
              <div className="flex gap-2">
                <Select value={newHour} onValueChange={(v) => v != null && setNewHour(v)}>
                  <SelectTrigger className="w-24"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Array.from({ length: 24 }, (_, h) => (
                      <SelectItem key={h} value={String(h).padStart(2, '0')}>
                        {String(h).padStart(2, '0')}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select value={newMinute} onValueChange={(v) => v != null && setNewMinute(v)}>
                  <SelectTrigger className="w-24"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Array.from({ length: 60 }, (_, m) => (
                      <SelectItem key={m} value={String(m).padStart(2, '0')}>
                        {String(m).padStart(2, '0')}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button type="button" variant="outline" size="sm" onClick={addTime}>
                  <Plus className="h-4 w-4 mr-1" />
                  {t('addTimePoint')}
                </Button>
              </div>
              <div className="flex flex-wrap gap-2">
                {notifyTimes.map((t) => (
                  <span
                    key={t}
                    className="flex items-center gap-2 rounded-md bg-blue-50 px-3 py-1.5 text-sm text-blue-700 dark:bg-blue-900/30 dark:text-blue-300"
                  >
                    {t}
                    <button type="button" onClick={() => removeTime(t)}>
                      <X className="h-4 w-4" />
                    </button>
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* 通知范围：方案C — 通知模式单选控制 */}
          <div className="space-y-4">
            <Label>{t('range')}</Label>

            {/* 通知模式单选 */}
            <div className="flex flex-col gap-2" role="radiogroup" aria-label={t('notifyMode')}>
              {/* 全员通知 */}
              <label
                className="flex items-start gap-3 cursor-pointer"
                data-testid="disposal-settings-notify-mode-all"
              >
                <input
                  type="radio"
                  name="notifyMode"
                  value="all"
                  checked={notifyMode === 'all'}
                  onChange={() => handleNotifyModeChange('all')}
                  className="mt-0.5 accent-primary"
                />
                <div className="space-y-0.5">
                  <span className="text-sm font-medium">{t('notifyModeAll')}</span>
                  {notifyMode === 'all' && (
                    <p className="text-xs text-muted-foreground flex items-center gap-1">
                      <Users className="w-3 h-3 shrink-0" />
                      {t('notifyModeAllHint')}
                    </p>
                  )}
                </div>
              </label>

              {/* 指定范围 */}
              <label
                className="flex items-start gap-3 cursor-pointer"
                data-testid="disposal-settings-notify-mode-specified"
              >
                <input
                  type="radio"
                  name="notifyMode"
                  value="specified"
                  checked={notifyMode === 'specified'}
                  onChange={() => handleNotifyModeChange('specified')}
                  className="mt-0.5 accent-primary"
                />
                <span className="text-sm font-medium">{t('notifyModeSpecified')}</span>
              </label>
            </div>

            {/* 指定范围时展示选择器 */}
            {notifyMode === 'specified' && (
              <NotificationScopeSelector
                selectedGroupIds={recipientGroupIds}
                selectedDeptPaths={departmentPaths}
                onGroupsChange={(ids) =>
                  setValue('quarantine.recipient_group_ids', ids, { shouldDirty: true })
                }
                onDeptsChange={(paths) =>
                  setValue('quarantine.department_paths', paths, { shouldDirty: true })
                }
              />
            )}
          </div>
        </div>
      </Card>

      <Card className="p-6 space-y-4">
        <div>
          <h2 className="text-lg font-semibold">{t('userPermissionSettings')}</h2>
          <p className="text-sm text-muted-foreground">{t('permissionDescription')}</p>
        </div>
        <Controller
          control={control}
          name="quarantine.portal_base_url"
          render={({ field, fieldState }) => {
            const portalUrl = (field.value ?? '').trim();
            return (
              <div className="space-y-1.5">
                <Label htmlFor="portal-base-url">{t('portalBaseUrlLabel')}</Label>
                <Input
                  id="portal-base-url"
                  value={field.value ?? ''}
                  onChange={field.onChange}
                  placeholder={t('portalBaseUrlPlaceholder')}
                  aria-invalid={!!fieldState.error}
                  className={fieldState.error ? 'border-destructive focus-visible:ring-destructive' : ''}
                />
                {fieldState.error ? (
                  <p className="text-sm text-destructive">{t('portalBaseUrlRequired')}</p>
                ) : portalUrl ? null : (
                  <p className="text-sm text-muted-foreground">{t('portalBaseUrlHelp')}</p>
                )}
              </div>
            );
          }}
        />
        {(() => {
          const portalUrl = (watch('quarantine.portal_base_url') ?? '').trim();
          let urlValid = false;
          if (portalUrl) {
            try {
              // 与 schema.ts 一致：后端强制 https-only
              urlValid = new URL(portalUrl).protocol === 'https:';
            } catch {
              urlValid = false;
            }
          }
          const portalMissing = !urlValid;
          return (
            <>
              {portalMissing && (
                <div className="flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-800 dark:border-amber-700 dark:bg-amber-900/20 dark:text-amber-300">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                  <span>{t('portalBaseUrlMissingHint')}</span>
                </div>
              )}
              <div className="overflow-hidden rounded-lg border">
                <table className="w-full">
                  <thead className="bg-muted/50">
                    <tr>
                      <th className="px-4 py-3 text-left text-sm font-medium">{t('permissionItem')}</th>
                      <th className="px-4 py-3 text-center text-sm font-medium">{t('status')}</th>
                      <th className="px-4 py-3 text-center text-sm font-medium">{t('validDays')}</th>
                      <th className="px-4 py-3 text-left text-sm font-medium">{t('description')}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {DISPOSAL_PERMISSION_KEYS.map((key) => {
                      const enabled = watch(`quarantine.permissions.${key}.enabled` as const);
                      return (
                        <tr key={key} className={portalMissing ? 'opacity-60' : ''}>
                          <td className="px-4 py-4 text-sm font-medium">
                            {t(`perm_${key}`)}
                            {(key === 'whitelist' || key === 'blacklist') && (
                              <span className="ml-2 rounded bg-amber-100 px-2 py-0.5 text-xs text-amber-700 dark:bg-amber-900/40 dark:text-amber-300">
                                {t('selfServicePending')}
                              </span>
                            )}
                          </td>
                          <td className="px-4 py-4">
                            <div className="flex justify-center">
                              <Controller
                                control={control}
                                name={`quarantine.permissions.${key}.enabled` as const}
                                render={({ field }) => (
                                  <Switch
                                    checked={field.value}
                                    onCheckedChange={field.onChange}
                                    disabled={portalMissing}
                                  />
                                )}
                              />
                            </div>
                          </td>
                          <td className="px-4 py-4">
                            <Controller
                              control={control}
                              name={`quarantine.permissions.${key}.valid_days` as const}
                              render={({ field }) => (
                                <Input
                                  type="number"
                                  min={1}
                                  max={365}
                                  className="mx-auto w-24"
                                  disabled={!enabled || portalMissing}
                                  value={field.value}
                                  onChange={(e) => field.onChange(parseInt(e.target.value, 10) || 0)}
                                />
                              )}
                            />
                          </td>
                          <td className="px-4 py-4 text-sm text-muted-foreground">
                            {t(`perm_${key}_desc`)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </>
          );
        })()}
      </Card>
    </div>
  );
}
