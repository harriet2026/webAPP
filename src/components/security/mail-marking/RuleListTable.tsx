'use client'

import { useTranslations } from 'next-intl'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { Edit, Loader2, Trash2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { MailMarkingRule } from './types'

interface Props {
  rules: MailMarkingRule[]
  scopeNames: Record<string, string>
  onEdit: (rule: MailMarkingRule) => void
  onDelete: (rule: MailMarkingRule) => void
  loading?: boolean
}

export function RuleListTable({ rules, scopeNames, onEdit, onDelete, loading }: Props) {
  const t = useTranslations('mailMarking')

  return (
    <div className="overflow-hidden rounded-lg border" data-testid="mail-marking-rule-table">
      <table className="w-full table-fixed text-sm">
        <thead className="bg-muted/50 text-xs text-muted-foreground">
          <tr>
            <th className="w-[92px] px-4 py-3 text-left">{t('priority')}</th>
            <th className="px-4 py-3 text-left">{t('ruleName')}</th>
            <th className="w-[220px] px-4 py-3 text-left">{t('applyTo')}</th>
            <th className="w-[150px] px-4 py-3 text-left">{t('position')}</th>
            <th className="w-[92px] px-4 py-3 text-left">{t('status')}</th>
            <th className="w-[112px] px-4 py-3 text-right">{t('operation')}</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border/70">
          {loading ? (
            <tr data-testid="mail-marking-loading-row">
              <td colSpan={6} className="px-4 py-12 text-center text-muted-foreground">
                <Loader2 className="mx-auto h-5 w-5 animate-spin" />
              </td>
            </tr>
          ) : rules.length === 0 ? (
            <tr data-testid="mail-marking-empty-row">
              <td colSpan={6} className="px-4 py-12 text-center text-muted-foreground">{t('noData')}</td>
            </tr>
          ) : rules.map((rule) => {
            const scopes = [...rule.departments, ...rule.groups]
            return (
              <tr
                key={rule.id}
                data-testid={`mail-marking-rule-row-${rule.id}`}
                className={cn('transition-colors hover:bg-muted/30', !rule.is_active && 'opacity-50')}
              >
                <td className="px-4 py-3 font-mono tabular-nums">{rule.priority}</td>
                <td className="truncate px-4 py-3 font-medium" title={rule.name}>{rule.name}</td>
                <td className="truncate px-4 py-3 text-muted-foreground" title={formatScopes(scopes, scopeNames, t('applyToAllUsers'))}>
                  {formatScopes(scopes, scopeNames, t('applyToAllUsers'))}
                </td>
                <td className="px-4 py-3">{formatPositions(rule, t)}</td>
                <td className="px-4 py-3">
                  <Badge
                    variant="outline"
                    className={rule.is_active
                      ? 'border-action-deliver/30 bg-action-deliver/10 text-action-deliver'
                      : 'border-border bg-muted text-muted-foreground'}
                  >
                    {rule.is_active ? t('enabled') : t('disabled')}
                  </Badge>
                </td>
                <td className="px-4 py-3 text-right">
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger render={
                        <Button
                          variant="ghost"
                          size="icon"
                          data-testid={`mail-marking-edit-${rule.id}`}
                          onClick={() => onEdit(rule)}
                          aria-label={t('edit')}
                        />
                      }>
                        <Edit className="h-4 w-4" />
                      </TooltipTrigger>
                      <TooltipContent>{t('edit')}</TooltipContent>
                    </Tooltip>
                    <Tooltip>
                      <TooltipTrigger render={
                        <Button
                          variant="ghost"
                          size="icon"
                          className="text-destructive hover:text-destructive"
                          data-testid={`mail-marking-delete-${rule.id}`}
                          onClick={() => onDelete(rule)}
                          aria-label={t('delete')}
                        />
                      }>
                        <Trash2 className="h-4 w-4" />
                      </TooltipTrigger>
                      <TooltipContent>{t('delete')}</TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

function formatScopes(scopes: string[], names: Record<string, string>, allUsers: string): string {
  if (scopes.length === 0) return allUsers
  return scopes.map((key) => names[key] ?? key).join('、')
}

function formatPositions(rule: MailMarkingRule, t: ReturnType<typeof useTranslations>): string {
  const positions = rule.direction === 'receive'
    ? rule.metadata.mark?.positions ?? []
    : rule.metadata.disclaimer?.positions ?? []
  if (positions.length > 1) return t('posMultiple')
  const map: Record<string, string> = {
    subject_prefix: t('posSubjectPrefix'),
    body_top: t('posBodyTop'),
    body_bottom: t('posBodyBottom'),
    header: t('posHeader'),
  }
  return positions.map((position) => map[position] ?? position).join(' / ')
}
