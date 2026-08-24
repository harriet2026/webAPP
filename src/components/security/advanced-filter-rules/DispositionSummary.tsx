'use client'

import { useTranslations } from 'next-intl'
import { disabledAddons, UI_ADDON_KEYS, type AddonKey, type PrimaryAction } from './conflict-matrix'
import type { AddonsState } from './validation'

/** 丢弃后邮件不再投递，右栏「完整表达式」不列附加策略。 */
export const TERMINAL_ACTIONS: Set<PrimaryAction> = new Set(['discard'])

/** 已启用 ∧ 未被冲突禁用 ∧ 非 detailedLog，按 UI_ADDON_KEYS 的展示顺序返回。 */
export function effectiveAddons(primaryAction: PrimaryAction, v: AddonsState): AddonKey[] {
  const disabled = new Set(disabledAddons(primaryAction))
  return UI_ADDON_KEYS.filter((k) => v[k]?.enabled && !disabled.has(k))
}

/** 每个 addon 一行人类可读摘要（配置摘要表右列）。 */
export function summarizeAddon(key: AddonKey, v: AddonsState): string {
  const params = v[key]?.params ?? {}
  switch (key) {
    case 'disclaimer':
      return [params.position, params.content].filter(Boolean).join(' / ') || '—'
    case 'emailTag':
      return [params.tag_position, params.tag_style, params.tag_content].filter(Boolean).join(' / ') || '—'
    case 'modifyHeader':
      return params.target_field ? `${params.target_field}: ${params.target_value ?? ''}` : '—'
    case 'adminNotify':
      return [params.recipients, `${params.merge_window_minutes ?? 5}min`].filter(Boolean).join(' / ')
    case 'deleteAttachment':
      return String(params.scope ?? '—')
    case 'forwardServer':
      return params.target_host
        ? `${params.forward_mode ?? 'copy'}:${params.target_host}:${params.target_port ?? 25}`
        : '—'
    case 'externalReminder':
      return String(params.position ?? '—')
    default:
      return '—'
  }
}

export function DispositionSummary({
  primaryAction,
  addonsValue,
  actionSummary,
}: {
  primaryAction: PrimaryAction
  addonsValue: AddonsState
  actionSummary: string
}) {
  const t = useTranslations('advancedRulesFeature')
  const addons = effectiveAddons(primaryAction, addonsValue)
  const terminal = TERMINAL_ACTIONS.has(primaryAction)

  return (
    <div className="border rounded-md p-3 space-y-3 overflow-y-auto" data-testid="disposition-summary">
      <section className="rounded-md border border-blue-200 bg-blue-50/50 dark:border-blue-900 dark:bg-blue-950/20 p-2">
        <h4 className="text-xs font-semibold text-blue-700 dark:text-blue-300 mb-1">
          {t('disposition.policyGroup')}
        </h4>
        <p className="text-xs" data-testid="summary-action">
          {t(`primaryActions.${primaryAction}` as never)}
          {actionSummary ? ` — ${actionSummary}` : ''}
        </p>
      </section>

      <section className="rounded-md border border-amber-200 bg-amber-50/50 dark:border-amber-900 dark:bg-amber-950/20 p-2">
        <h4 className="text-xs font-semibold text-amber-700 dark:text-amber-300 mb-1">
          {t('disposition.fullExpression')}
        </h4>
        {terminal ? (
          <p className="text-xs text-muted-foreground" data-testid="summary-terminal">
            {t('disposition.terminalNoAddons')}
          </p>
        ) : (
          <ol className="text-xs list-decimal list-inside space-y-0.5" data-testid="summary-addon-list">
            {addons.map((k) => (
              <li key={k}>{t(`addons.${k}` as never)}</li>
            ))}
          </ol>
        )}
      </section>

      <section>
        <h4 className="text-xs font-semibold mb-1">{t('disposition.configSummary')}</h4>
        <table className="w-full text-xs" data-testid="summary-config-table">
          <thead>
            <tr className="text-muted-foreground">
              <th className="text-left font-medium py-1">{t('disposition.columnPolicy')}</th>
              <th className="text-left font-medium py-1">{t('disposition.columnConfig')}</th>
            </tr>
          </thead>
          <tbody>
            {addons.map((k) => (
              <tr key={k} className="border-t">
                <td className="py-1 pr-2 align-top">{t(`addons.${k}` as never)}</td>
                <td className="py-1 align-top break-all">{summarizeAddon(k, addonsValue)}</td>
                </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  )
}
