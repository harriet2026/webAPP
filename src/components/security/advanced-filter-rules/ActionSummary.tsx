'use client';

import { useTranslations } from 'next-intl';
import { cn } from '@/lib/utils';
import { disabledAddons, UI_ADDON_KEYS, type AddonKey, type PrimaryAction } from './conflict-matrix';
import type { RuleForm } from './rule-form';

// ActionSummary.tsx — layer-4-actions.html 右栏三区：
//   ① OR 策略组卡（动作行 + 已启用未冲突 addon 行 + 参数摘要小字）
//   ② 完整表达式琥珀卡（动作详述；discard 终结动作不列 addon；none 文案）
//   ③ 配置摘要两列表（策略/配置）
// Pure read-only projection of `form` — no state of its own.

const ACTION_COLOR_CLASS: Record<PrimaryAction, string> = {
  none: 'bg-muted-foreground',
  deliver: 'bg-action-deliver',
  tagDeliver: 'bg-action-mark-deliver',
  quarantine: 'bg-action-quarantine',
  review: 'bg-action-review',
  discard: 'bg-action-drop',
};

// Builds the short one-line "sum" string shown next to each enabled addon
// (mirrors demo ADDONS[].sum, but derived from live params + i18n option
// labels instead of a static string).
function addonSummary(t: ReturnType<typeof useTranslations>, key: AddonKey, params: Record<string, unknown>): string {
  switch (key) {
    case 'disclaimer': {
      const position = String(params.position ?? 'body_bottom');
      return position === 'body_top'
        ? t('addons.deleteAttachmentNoticePositionTop')
        : position === 'header'
          ? t('addons.disclaimerPositionHeader')
          : t('addons.deleteAttachmentNoticePositionBottom');
    }
    case 'externalReminder': {
      const position = String(params.position ?? 'body_top');
      return position === 'body_bottom'
        ? t('addons.externalReminderPositionBottom')
        : t('addons.externalReminderPositionTop');
    }
    case 'adminNotify': {
      const rt = String(params.recipient_type ?? 'adminList');
      const rtLabel =
        rt === 'manual'
          ? t('addons.adminNotifyRecipientTypeManual')
          : rt === 'group'
            ? t('addons.adminNotifyRecipientTypeGroup')
            : rt === 'org'
              ? t('addons.adminNotifyRecipientTypeOrg')
              : t('addons.adminNotifyRecipientTypeAdminList');
      const minutes = Number(params.merge_window_minutes ?? 5);
      return t('disposition.summaryMergeWindow', { recipientType: rtLabel, minutes });
    }
    case 'deleteAttachment': {
      const scope = String(params.scope ?? 'all');
      const scopeKey =
        scope === 'virusDetected'
          ? 'deleteAttachmentScopeVirus'
          : scope === 'specificType'
            ? 'deleteAttachmentScopeType'
            : scope === 'overSize'
              ? 'deleteAttachmentScopeOverSize'
              : scope === 'encrypted'
                ? 'deleteAttachmentScopeEncrypted'
                : scope === 'nestedZip'
                  ? 'deleteAttachmentScopeNestedZip'
                  : scope === 'hasQrCode'
                    ? 'deleteAttachmentScopeQrCode'
                    : 'deleteAttachmentScopeAll';
      return t('disposition.summaryScope', { scope: t(`addons.${scopeKey}` as never) });
    }
    case 'emailTag': {
      const posKey =
        params.tag_position === 'subject_suffix'
          ? 'tagPositionSuffix'
          : params.tag_position === 'body_start'
            ? 'tagPositionBodyStart'
            : params.tag_position === 'body_end'
              ? 'tagPositionBodyEnd'
              : params.tag_position === 'header'
                ? 'tagPositionHeader'
                : 'tagPositionPrefix';
      return t(`addons.${posKey}` as never);
    }
    case 'forwardServer': {
      const mode = params.forward_mode === 'redirect' ? 'redirect' : 'copy';
      return `${mode}:${String(params.target_port ?? 25)}`;
    }
    case 'modifyHeader': {
      const field = String(params.target_field ?? 'Subject');
      const opKey =
        params.operation === 'prefix'
          ? 'modifyHeaderOperationPrefix'
          : params.operation === 'suffix'
            ? 'modifyHeaderOperationSuffix'
            : params.operation === 'regex_replace'
              ? 'modifyHeaderOperationRegexReplace'
              : params.operation === 'delete'
                ? 'modifyHeaderOperationDelete'
                : 'modifyHeaderOperationReplace';
      return `${field} ${t(`addons.${opKey}` as never)}`;
    }
    case 'detailedLog':
    default:
      return '';
  }
}

interface Props {
  form: RuleForm;
}

export function ActionSummary({ form }: Props) {
  const t = useTranslations('advancedRulesFeature');
  const action = form.primaryAction;
  const disabledSet = new Set(disabledAddons(action));
  const enabledKeys = UI_ADDON_KEYS.filter((k) => form.addons[k]?.enabled && !disabledSet.has(k));
  const terminal = action === 'discard';
  const actionLabel = t(`primaryActions.${action}` as never);

  return (
    <div className="space-y-3 text-xs" data-testid="action-summary">
      <div className="mb-1 text-sm font-semibold">{t('disposition.previewTitle')}</div>

      {/* ① OR 策略组卡 */}
      <div className="rounded-lg border p-3" data-testid="summary-or-group-card">
        <div className="mb-2">
          <span className="rounded-md bg-primary px-2 py-0.5 text-[10.5px] font-bold text-primary-foreground">
            {t('disposition.orGroupTag')}
          </span>
        </div>
        <ul className="space-y-1.5">
          <li className="flex items-start gap-1.5">
            <span className={cn('mt-1 h-1.5 w-1.5 shrink-0 rounded-full', ACTION_COLOR_CLASS[action])} />
            <div>
              <div>{actionLabel}</div>
            </div>
          </li>
          {enabledKeys.map((k) => (
            <li key={k} className="flex items-start gap-1.5">
              <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-500" />
              <div>
                <div>{t(`addons.${k}` as never)}</div>
                <div className="text-muted-foreground">{addonSummary(t, k, form.addons[k]?.params ?? {})}</div>
              </div>
            </li>
          ))}
        </ul>
      </div>

      {/* ② 完整表达式琥珀卡 */}
      <div
        className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200"
        data-testid="summary-full-expression"
      >
        <div className="mb-1 font-semibold">{t('disposition.fullExpressionTitle')}</div>
        {action === 'none' ? (
          <p>{t('disposition.noneHint')}</p>
        ) : (
          <p>
            {t('disposition.willBeActioned', { action: actionLabel })}
          </p>
        )}
        {enabledKeys.length > 0 && !terminal && (
          <>
            <p className="mt-1">{t('disposition.andExecuteAddons')}</p>
            <ol className="ml-4 list-decimal space-y-0.5">
              {enabledKeys.map((k) => (
                <li key={k}>
                  {t(`addons.${k}` as never)}（{addonSummary(t, k, form.addons[k]?.params ?? {})}）
                </li>
              ))}
            </ol>
          </>
        )}
      </div>

      {/* ③ 配置摘要 */}
      <div data-testid="summary-config-table">
        <div className="mb-1 font-semibold">{t('disposition.configSummaryTitle')}</div>
        <table className="w-full border-collapse text-[11.5px]">
          <thead>
            <tr>
              <th className="border px-1.5 py-1 text-left bg-muted">{t('disposition.configSummaryPolicyCol')}</th>
              <th className="border px-1.5 py-1 text-left bg-muted">{t('disposition.configSummaryConfigCol')}</th>
            </tr>
          </thead>
          <tbody>
            {action !== 'none' && (
              <tr>
                <td className="border px-1.5 py-1">{actionLabel}</td>
                <td className="border px-1.5 py-1">
                  {t('disposition.summaryDefaultParams')}
                </td>
              </tr>
            )}
            {enabledKeys.map((k) => (
              <tr key={k}>
                <td className="border px-1.5 py-1">{t(`addons.${k}` as never)}</td>
                <td className="border px-1.5 py-1">{addonSummary(t, k, form.addons[k]?.params ?? {})}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// exported for future reuse / testing of the summary-string logic in isolation
export { addonSummary };
