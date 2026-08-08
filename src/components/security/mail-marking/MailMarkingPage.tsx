'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useTranslations } from 'next-intl'
import { toast } from 'sonner'
import { ChevronLeft, ChevronRight, FileText, Plus, Tag } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { RuleListTable } from './RuleListTable'
import { RuleEditDrawer } from './RuleEditDrawer'
import {
  deleteMailMarkingRule, listMailMarkingRules, listMailMarkingScopes,
  type MailMarkingScope,
} from '@/lib/api/mail-marking'
import type { MailMarkingDirection, MailMarkingRule } from './types'
import { ModuleMasterSwitch } from '@/components/security/ModuleMasterSwitch'
import { useApiRequest } from '@/lib/api/client'
import { useAuth } from '@/contexts/auth-context'
import { getRulePriorityRange } from '@/components/security/advanced-filter-rules/priority-range'

interface Props { embedded?: boolean }

export function MailMarkingPage({ embedded }: Props) {
  const t = useTranslations('mailMarking')
  const { apiRequest } = useApiRequest()
  const { isSystemAdmin } = useAuth()
  const priorityRange = useMemo(() => getRulePriorityRange(isSystemAdmin), [isSystemAdmin])
  const [direction, setDirection] = useState<MailMarkingDirection>('receive')
  const [rules, setRules] = useState<MailMarkingRule[]>([])
  const [scopes, setScopes] = useState<MailMarkingScope[]>([])
  const [loading, setLoading] = useState(false)
  const [editing, setEditing] = useState<MailMarkingRule | null>(null)
  const [editorOpen, setEditorOpen] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<MailMarkingRule | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)

  const loadRules = useCallback(async () => {
    setLoading(true)
    try {
      // 规则请求是核心，失败则报错；scopes 请求失败时静默降级为空列表（不影响规则展示）
      const [ruleResult, scopeResult] = await Promise.allSettled([
        listMailMarkingRules(direction, apiRequest),
        listMailMarkingScopes(direction, apiRequest),
      ])
      if (ruleResult.status === 'fulfilled') {
        setRules(ruleResult.value)
      } else {
        setRules([])
        toast.error(t('loadFailed') + ': ' + errorMessage(ruleResult.reason))
      }
      setScopes(scopeResult.status === 'fulfilled' ? scopeResult.value : [])
    } finally {
      setLoading(false)
    }
  }, [apiRequest, direction, t])

  useEffect(() => { void loadRules() }, [loadRules])

  const totalPages = Math.max(1, Math.ceil(rules.length / pageSize))
  const safePage = Math.min(page, totalPages)
  const visibleRules = useMemo(
    () => rules.slice((safePage - 1) * pageSize, safePage * pageSize),
    [pageSize, rules, safePage],
  )
  const scopeNames = useMemo(
    () => Object.fromEntries(scopes.map((scope) => [scope.key, scope.name])),
    [scopes],
  )
  const nextPriority = useMemo(() => {
    if (rules.length === 0) return priorityRange.defaultValue
    const max = Math.max(...rules.map((rule) => rule.priority))
    return Math.min(Math.max(max + 1, priorityRange.min), priorityRange.max)
  }, [rules, priorityRange])

  const handleSaved = useCallback(() => {
    setEditorOpen(false)
    setEditing(null)
    void loadRules()
    toast.success(t('saved'))
  }, [loadRules, t])

  const handleDeleteConfirm = useCallback(async () => {
    if (!deleteTarget) return
    setDeleting(true)
    try {
      await deleteMailMarkingRule(deleteTarget.id, apiRequest)
      toast.success(t('deleted'))
      setDeleteTarget(null)
      await loadRules()
    } catch (error: unknown) {
      toast.error(t('deleteFailed') + ': ' + errorMessage(error))
    } finally {
      setDeleting(false)
    }
  }, [apiRequest, deleteTarget, loadRules, t])

  return (
    <ModuleMasterSwitch page="mail_marking" title={t('title')}>
      <div className="space-y-4" data-testid="mail-marking-workspace" data-embedded={embedded ? 'true' : undefined}>
        <p className="text-sm text-muted-foreground" data-testid="mail-marking-subtitle">{t('subtitle')}</p>

        <Tabs
          value={direction}
          onValueChange={(value) => {
            setDirection(value as MailMarkingDirection)
            setPage(1)
          }}
          data-testid="mail-marking-direction-tabs"
        >
          <TabsList>
            <TabsTrigger value="receive" data-testid="mail-marking-tab-receive">
              <Tag className="mr-1 h-4 w-4" />{t('tabReceive')}
            </TabsTrigger>
            <TabsTrigger value="send" data-testid="mail-marking-tab-send">
              <FileText className="mr-1 h-4 w-4" />{t('tabSend')}
            </TabsTrigger>
          </TabsList>

          <TabsContent value={direction} className="mt-4 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground" data-testid="mail-marking-total">
                {t('totalRules', { count: rules.length })}
              </span>
              <Button
                size="sm"
                data-testid="mail-marking-create-rule"
                onClick={() => { setEditing(null); setEditorOpen(true) }}
              >
                <Plus className="mr-1 h-4 w-4" />{t('createRule')}
              </Button>
            </div>

            <RuleListTable
              rules={visibleRules}
              scopeNames={scopeNames}
              loading={loading}
              onEdit={(rule) => { setEditing(rule); setEditorOpen(true) }}
              onDelete={setDeleteTarget}
            />

            {rules.length > pageSize && (
              <div className="flex items-center justify-end gap-2" data-testid="mail-marking-pagination">
                <Select
                  value={String(pageSize)}
                  onValueChange={(value) => { setPageSize(Number(value)); setPage(1) }}
                >
                  <SelectTrigger className="h-8 w-[92px]" data-testid="mail-marking-page-size">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {[10, 20, 50, 100].map((size) => <SelectItem key={size} value={String(size)}>{size}</SelectItem>)}
                  </SelectContent>
                </Select>
                <Button variant="outline" size="icon" disabled={safePage <= 1} onClick={() => setPage(safePage - 1)}>
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <span className="min-w-16 text-center text-sm">{safePage} / {totalPages}</span>
                <Button variant="outline" size="icon" disabled={safePage >= totalPages} onClick={() => setPage(safePage + 1)}>
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            )}

            <p className="text-xs text-muted-foreground" data-testid="mail-marking-priority-hint">{t('priorityHint', { min: priorityRange.min, max: priorityRange.max })}</p>
          </TabsContent>
        </Tabs>

        <RuleEditDrawer
          open={editorOpen}
          onOpenChange={setEditorOpen}
          direction={direction}
          rule={editing}
          nextPriority={nextPriority}
          priorityRange={priorityRange}
          onSaved={handleSaved}
        />

        <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && !deleting && setDeleteTarget(null)}>
          <AlertDialogContent className="sm:max-w-[512px]" data-testid="mail-marking-delete-dialog">
            <AlertDialogHeader>
              <AlertDialogTitle>{t('deleteDialogTitle')}</AlertDialogTitle>
              <AlertDialogDescription>{t('deleteConfirm', { name: deleteTarget?.name ?? '' })}</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={deleting}>{t('cancel')}</AlertDialogCancel>
              <AlertDialogAction
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                disabled={deleting}
                data-testid="mail-marking-delete-confirm"
                onClick={(event) => { event.preventDefault(); void handleDeleteConfirm() }}
              >
                {t('delete')}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </ModuleMasterSwitch>
  )
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
