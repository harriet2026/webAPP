'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { testMailMarkingRule, type SaveMailMarkingPayload } from '@/lib/api/mail-marking'
import { useApiRequest } from '@/lib/api/client'

export function SimulateTestPanel({ payload }: { payload: SaveMailMarkingPayload }) {
  const t = useTranslations('mailMarking')
  const { apiRequest } = useApiRequest()
  const [email, setEmail] = useState('')
  const [result, setResult] = useState<null | { matched: boolean; ruleName?: string }>(null)
  const [running, setRunning] = useState(false)

  const run = async () => {
    if (!email.trim()) return
    setRunning(true)
    try {
      setResult(await testMailMarkingRule(payload, email.trim(), apiRequest))
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : String(error))
    } finally {
      setRunning(false)
    }
  }

  return (
    <div className="space-y-3" data-testid="mail-marking-simulate-panel">
      <label className="text-sm font-medium">{t('testEmailLabel')}</label>
      <Input
        value={email}
        data-testid="mail-marking-test-email"
        onChange={(event) => { setEmail(event.target.value); setResult(null) }}
        placeholder={t('testEmailPlaceholder')}
      />
      <div className="flex gap-2">
        <Button size="sm" onClick={() => void run()} disabled={running || !email.trim()} data-testid="mail-marking-run-test">
          {t('runTest')}
        </Button>
        <Button size="sm" variant="outline" onClick={() => { setEmail(''); setResult(null) }} data-testid="mail-marking-reset-test">
          {t('reset')}
        </Button>
      </div>
      {result && (
        <div
          data-testid="mail-marking-test-result"
          className={result.matched ? 'text-sm text-action-deliver' : 'text-sm text-muted-foreground'}
        >
          {result.matched ? t('testMatchedRule', { name: result.ruleName || payload.name || t('unnamedRule') }) : t('testNotMatched')}
        </div>
      )}
    </div>
  )
}
