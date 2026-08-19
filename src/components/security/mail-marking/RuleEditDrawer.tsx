'use client'

import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { useTranslations } from 'next-intl'
import { toast } from 'sonner'
import { AlertTriangle, Beaker, Eye, Info, Loader2, X } from 'lucide-react'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Collapsible, CollapsibleContent } from '@/components/ui/collapsible'
import { CollapsibleSectionTrigger } from '@/components/ui/collapsible-section-trigger'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import {
  listMailMarkingScopes, saveMailMarkingRule,
  type MailMarkingScope, type SaveMailMarkingPayload,
} from '@/lib/api/mail-marking'
import { useApiRequest } from '@/lib/api/client'
import {
  DEFAULT_CUSTOM_COLORS, DEFAULT_RECEIVE_METADATA, DEFAULT_SEND_METADATA,
  RECEIVE_MARKING_VARIABLES, SEND_DISCLAIMER_VARIABLES,
} from './defaults'
import type {
  DisclaimerFormat, DisclaimerPosition, MailMarkingDirection, MailMarkingRule,
  MarkPosition, MarkStyle,
} from './types'
import { MarkPreview } from './MarkPreview'
import { DisclaimerPreview } from './DisclaimerPreview'
import { SimulateTestPanel } from './SimulateTestPanel'

interface Props {
  open: boolean
  onOpenChange: (value: boolean) => void
  direction: MailMarkingDirection
  rule: MailMarkingRule | null
  nextPriority: number
  onSaved: () => void
}

type FormErrors = Partial<Record<'name' | 'priority' | 'markText' | 'disclaimer' | 'header' | 'colors', string>>
type PositionChoice = 'subject_prefix' | 'body_top' | 'body_bottom' | 'header' | 'multiple'

export function RuleEditDrawer({ open, onOpenChange, direction, rule, nextPriority, onSaved }: Props) {
  const t = useTranslations('mailMarking')
  const { apiRequest } = useApiRequest()
  const [form, setForm] = useState<SaveMailMarkingPayload>(() => emptyForm(direction, nextPriority))
  const [availableScopes, setAvailableScopes] = useState<MailMarkingScope[]>([])
  const [errors, setErrors] = useState<FormErrors>({})
  const [saving, setSaving] = useState(false)
  const [previewOpen, setPreviewOpen] = useState(true)
  const [testOpen, setTestOpen] = useState(false)

  useEffect(() => {
    if (!open) return
    setErrors({})
    setPreviewOpen(true)
    setTestOpen(false)
    void listMailMarkingScopes(direction, apiRequest).then(setAvailableScopes).catch(() => setAvailableScopes([]))
    if (rule) {
      setForm({
        id: rule.id,
        name: rule.name,
        description: rule.description ?? '',
        priority: rule.priority,
        is_active: rule.is_active,
        metadata: structuredClone(rule.metadata),
        departments: [...rule.departments],
        groups: [...rule.groups],
      })
    } else {
      setForm(emptyForm(direction, nextPriority))
    }
  }, [apiRequest, direction, nextPriority, open, rule])

  const isReceive = form.metadata.direction === 'receive'
  const departments = availableScopes.filter((scope) => scope.kind === 'department')
  const groups = availableScopes.filter((scope) => scope.kind === 'group')
  const disclaimerBytes = useMemo(
    () => new TextEncoder().encode(form.metadata.disclaimer?.content ?? '').length,
    [form.metadata.disclaimer?.content],
  )

  const setMark = (patch: Partial<NonNullable<typeof form.metadata.mark>>) => setForm((current) => ({
    ...current,
    metadata: { ...current.metadata, mark: { ...current.metadata.mark!, ...patch } },
  }))
  const setDisclaimer = (patch: Partial<NonNullable<typeof form.metadata.disclaimer>>) => setForm((current) => ({
    ...current,
    metadata: { ...current.metadata, disclaimer: { ...current.metadata.disclaimer!, ...patch } },
  }))

  const onSave = async () => {
    const nextErrors = validate(form, t)
    setErrors(nextErrors)
    if (Object.keys(nextErrors).length > 0) return
    setSaving(true)
    try {
      await saveMailMarkingRule(form, apiRequest)
      onSaved()
    } catch (error: unknown) {
      toast.error(t('saveFailed') + ': ' + (error instanceof Error ? error.message : String(error)))
    } finally {
      setSaving(false)
    }
  }

  const title = rule
    ? (isReceive ? t('editReceiveRule') : t('editSendRule'))
    : (isReceive ? t('createReceiveRule') : t('createSendRule'))

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="data-[side=right]:w-[920px] data-[side=right]:sm:max-w-[920px] p-0 flex flex-col"
        data-testid="mail-marking-rule-editor"
      >
        <SheetHeader className="shrink-0 border-b px-6 py-4 text-left">
          <div className="flex items-center justify-between gap-4">
            <div>
              <SheetTitle className="text-lg font-semibold">{title}</SheetTitle>
              <p className="mt-1 text-sm text-muted-foreground">
                {isReceive ? t('receiveEditorSubtitle') : t('sendEditorSubtitle')}
              </p>
            </div>
            <div className="mr-8 flex items-center gap-2">
              <Button size="sm" variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>{t('cancel')}</Button>
              <Button size="sm" data-testid="mail-marking-save-rule" onClick={() => void onSave()} disabled={saving}>
                {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}{t('save')}
              </Button>
            </div>
          </div>
        </SheetHeader>

        <div className="grid min-h-0 flex-1 grid-cols-[560px_1fr] overflow-hidden">
          <div className="space-y-6 overflow-y-auto border-r p-6" data-testid="mail-marking-editor-form">
            <FormSection title={t('basicConfig')} tone="primary">
              <FormRow label={t('ruleName')} tip={t('ruleNameTip')} required>
                <FieldBlock error={errors.name}>
                  <Input
                    value={form.name}
                    data-testid="mail-marking-rule-name"
                    placeholder={t('ruleNamePlaceholder')}
                    onChange={(event) => setForm({ ...form, name: event.target.value })}
                  />
                </FieldBlock>
              </FormRow>
              <FormRow label={t('priority')} tip={t('priorityTip')} required>
                <FieldBlock error={errors.priority}>
                  <div className="flex items-center gap-2">
                    <Input
                      type="number"
                      min={1}
                      step={1}
                      value={form.priority}
                      className="w-20 shrink-0"
                      data-testid="mail-marking-priority"
                      onChange={(event) => setForm({ ...form, priority: Number(event.target.value) })}
                    />
                    <span className="text-xs leading-5 text-muted-foreground">({t('priorityTip')})</span>
                  </div>
                </FieldBlock>
              </FormRow>
              <FormRow label={t('status')}>
                <RadioGroup
                  value={form.is_active ? 'enabled' : 'disabled'}
                  onValueChange={(value) => setForm({ ...form, is_active: value === 'enabled' })}
                  className="flex gap-4"
                  data-testid="mail-marking-status"
                >
                  <RadioOption id="mail-marking-disabled" value="disabled" label={t('disabled')} />
                  <RadioOption id="mail-marking-enabled" value="enabled" label={t('enabled')} />
                </RadioGroup>
              </FormRow>
            </FormSection>

            <FormSection title={t('applyTo')} hint={isReceive ? t('applyToReceiveHint') : t('applyToSendHint')} tone="warning">
              <FormRow label={t('departments')} top>
                <ScopePicker
                  placeholder={t('selectDepartment')}
                  options={departments}
                  selected={form.departments}
                  onChange={(selected) => setForm({ ...form, departments: selected })}
                  testId="mail-marking-departments"
                />
              </FormRow>
              <FormRow label={isReceive ? t('recipientGroups') : t('senderGroups')} top>
                <ScopePicker
                  placeholder={t('selectGroup')}
                  options={groups}
                  selected={form.groups}
                  onChange={(selected) => setForm({ ...form, groups: selected })}
                  testId="mail-marking-groups"
                />
              </FormRow>
              <p className="ml-[112px] flex items-center gap-1 text-xs text-muted-foreground" title={t('applyToTip')}>
                <Info className="h-3 w-3" />{t('noGroupSelectedHint')}
              </p>
            </FormSection>

            {isReceive ? renderMarkForm() : renderDisclaimerForm()}
          </div>

          <div className="space-y-4 overflow-y-auto bg-muted p-6" data-testid="mail-marking-editor-preview-column">
            <Collapsible open={previewOpen} onOpenChange={setPreviewOpen}>
              <CollapsibleSectionTrigger className="h-9 border bg-background text-foreground shadow-xs">
                <Eye className="h-4 w-4" />{t('configPreview')}
              </CollapsibleSectionTrigger>
              <CollapsibleContent className="mt-3">
                <EmailPreview form={form} scopeNames={Object.fromEntries(availableScopes.map((scope) => [scope.key, scope.name]))} />
              </CollapsibleContent>
            </Collapsible>

            <Collapsible open={testOpen} onOpenChange={setTestOpen}>
              <CollapsibleSectionTrigger
                className="h-9 border bg-background text-foreground shadow-xs"
                data-testid="mail-marking-test-toggle"
              >
                <Beaker className="h-4 w-4" />{t('simulateTest')}
              </CollapsibleSectionTrigger>
              <CollapsibleContent className="mt-3">
                <div className="rounded-lg border bg-background p-4">
                  <SimulateTestPanel payload={form} />
                </div>
              </CollapsibleContent>
            </Collapsible>

            <div className="rounded-lg bg-primary/10 p-4" data-testid="mail-marking-tips">
              <div className="mb-2 flex items-center gap-1 text-sm font-medium text-primary">
                <Info className="h-4 w-4" />{t('configurationTips')}
              </div>
              <ol className="space-y-1 text-xs text-primary">
                {[1, 2, 3, 4, 5].map((index) => <li key={index}>{index}. {t(`${isReceive ? 'receiveTip' : 'sendTip'}${index}`)}</li>)}
              </ol>
            </div>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  )

  function renderMarkForm() {
    const mark = form.metadata.mark!
    const position = markPositionChoice(mark.positions)
    const custom = mark.custom_colors ?? DEFAULT_CUSTOM_COLORS
    return (
      <FormSection title={t('markConfig')} tone="success">
        <FormRow label={t('markText')} tip={t('markTextTip')} required top>
          <FieldBlock error={errors.markText}>
            <Input
              maxLength={50}
              value={mark.text}
              data-testid="mail-marking-mark-text"
              placeholder={t('markTextPlaceholder')}
              onChange={(event) => setMark({ text: event.target.value })}
            />
            <VariableBadges
              variables={RECEIVE_MARKING_VARIABLES}
              onInsert={(variable) => setMark({ text: appendVariable(mark.text, variable) })}
            />
            <div className="text-right text-xs text-muted-foreground">{[...mark.text].length}/50</div>
          </FieldBlock>
        </FormRow>

        <FormRow label={t('markPosition')}>
          <RadioGroup
            value={position}
            onValueChange={(value) => setMark({ positions: markPositionsForChoice(value as PositionChoice) })}
            className="flex flex-wrap gap-x-4 gap-y-3"
            data-testid="mail-marking-mark-position"
          >
            <RadioOption id="mark-pos-subject" value="subject_prefix" label={t('posSubjectPrefix')} />
            <RadioOption id="mark-pos-body" value="body_top" label={t('posBodyTop')} />
            <RadioOption id="mark-pos-header" value="header" label={t('posHeader')} />
            <RadioOption id="mark-pos-multiple" value="multiple" label={t('posMultiple')} />
          </RadioGroup>
        </FormRow>

        <FormRow label={t('markStyle')} top>
          <div className="space-y-3">
            <RadioGroup
              value={mark.style}
              onValueChange={(value) => setMark({
                style: value as MarkStyle,
                custom_colors: value === 'custom' ? custom : undefined,
              })}
              className="flex flex-wrap gap-x-4 gap-y-3"
              data-testid="mail-marking-mark-style"
            >
              <RadioOption id="mark-style-blue" value="blue_tag" label={t('styleBlueTag')} />
              <RadioOption id="mark-style-orange" value="orange_warning" label={t('styleOrangeWarning')} />
              <RadioOption id="mark-style-plain" value="plain_text" label={t('stylePlainText')} />
              <RadioOption id="mark-style-custom" value="custom" label={t('styleCustom')} />
            </RadioGroup>

            {mark.style === 'custom' && (
              <FieldBlock error={errors.colors}>
                <div className="rounded-lg border p-4" data-testid="mail-marking-custom-colors">
                  <h4 className="mb-3 text-sm font-medium">{t('styleCustom')}</h4>
                  <div className="grid grid-cols-2 gap-4">
                    <ColorField label={t('customColorBg')} value={custom.bg} onChange={(value) => setMark({ custom_colors: { ...custom, bg: value } })} />
                    <ColorField label={t('customColorText')} value={custom.text} onChange={(value) => setMark({ custom_colors: { ...custom, text: value } })} />
                    <ColorField label={t('customColorBorder')} value={custom.border} onChange={(value) => setMark({ custom_colors: { ...custom, border: value } })} />
                    <div className="flex items-center gap-2">
                      <Label className="text-sm">{t('customColorRadius')}:</Label>
                      <Input className="w-16" type="number" min={0} max={20} value={custom.radius} onChange={(event) => setMark({ custom_colors: { ...custom, radius: Number(event.target.value) } })} />
                      <span className="text-sm">px</span>
                    </div>
                  </div>
                </div>
              </FieldBlock>
            )}

            <div className="rounded-lg border p-4">
              <h4 className="mb-3 text-sm font-medium">{t('preview')}</h4>
              <MarkPreview block={mark} />
              {(position === 'subject_prefix' || position === 'multiple') && mark.style !== 'plain_text' && (
                <p className="mt-2 flex items-center gap-1 text-xs text-warning">
                  <AlertTriangle className="h-3 w-3" />{t('subjectPrefixPlainOnlyWarn')}
                </p>
              )}
            </div>
          </div>
        </FormRow>

        {position === 'header' && (
          <FormRow label={t('headerNameLabel')} top>
            <FieldBlock error={errors.header}>
              <Input value={mark.header_name ?? ''} placeholder={t('headerNamePlaceholder')} onChange={(event) => setMark({ header_name: event.target.value })} />
            </FieldBlock>
          </FormRow>
        )}
      </FormSection>
    )
  }

  function renderDisclaimerForm() {
    const disclaimer = form.metadata.disclaimer!
    const position = disclaimerPositionChoice(disclaimer.positions)
    return (
      <FormSection title={t('disclaimerConfig')} tone="success">
        <FormRow label={t('disclaimerContent')} tip={t('disclaimerContentTip')} required top>
          <FieldBlock error={errors.disclaimer}>
            <Textarea
              className="min-h-[120px]"
              value={disclaimer.content}
              data-testid="mail-marking-disclaimer-content"
              placeholder={t('disclaimerContentPlaceholder')}
              onChange={(event) => setDisclaimer({ content: event.target.value })}
            />
            <VariableBadges
              variables={SEND_DISCLAIMER_VARIABLES}
              onInsert={(variable) => setDisclaimer({ content: appendVariable(disclaimer.content, variable) })}
            />
            <p className="text-xs text-muted-foreground">{disclaimerBytes} / 10240 bytes</p>
          </FieldBlock>
        </FormRow>

        <FormRow label={t('disclaimerPosition')}>
          <RadioGroup
            value={position}
            onValueChange={(value) => setDisclaimer({ positions: disclaimerPositionsForChoice(value as PositionChoice) })}
            className="flex flex-wrap gap-x-4 gap-y-3"
            data-testid="mail-marking-disclaimer-position"
          >
            <RadioOption id="disclaimer-pos-top" value="body_top" label={t('posBodyTop')} />
            <RadioOption id="disclaimer-pos-bottom" value="body_bottom" label={t('posBodyBottom')} />
            <RadioOption id="disclaimer-pos-header" value="header" label={t('posHeader')} />
            <RadioOption id="disclaimer-pos-multiple" value="multiple" label={t('posMultiple')} />
          </RadioGroup>
        </FormRow>

        <FormRow label={t('disclaimerFormat')}>
          <RadioGroup
            value={disclaimer.format}
            onValueChange={(value) => setDisclaimer({ format: value as DisclaimerFormat })}
            className="flex flex-wrap gap-x-4 gap-y-3"
            data-testid="mail-marking-disclaimer-format"
          >
            <RadioOption id="disclaimer-format-auto" value="auto" label={t('formatAuto')} />
            <RadioOption id="disclaimer-format-html" value="html_only" label={t('formatHtmlOnly')} />
            <RadioOption id="disclaimer-format-plain" value="plain_only" label={t('formatPlainOnly')} />
          </RadioGroup>
        </FormRow>

        {position === 'header' && (
          <FormRow label={t('headerNameLabel')} top>
            <FieldBlock error={errors.header}>
              <Input value={disclaimer.header_name ?? 'X-Disclaimer'} placeholder="X-Disclaimer" onChange={(event) => setDisclaimer({ header_name: event.target.value })} />
            </FieldBlock>
          </FormRow>
        )}
      </FormSection>
    )
  }
}

type SectionTone = 'primary' | 'warning' | 'success'

function FormSection({ title, hint, tone, children }: { title: string; hint?: string; tone: SectionTone; children: ReactNode }) {
  const barClass: Record<SectionTone, string> = {
    primary: 'bg-primary',
    warning: 'bg-warning',
    success: 'bg-success',
  }
  return (
    <section className="space-y-4 rounded-lg bg-muted/40 p-5">
      <div className="flex items-center gap-2">
        <span className={`h-5 w-1 rounded-full ${barClass[tone]}`} />
        <h3 className="font-medium">{title}</h3>
        {hint && <span className="text-xs text-muted-foreground">({hint})</span>}
      </div>
      {children}
    </section>
  )
}

function FormRow({ label, tip, required, top = false, children }: {
  label: string
  tip?: string
  required?: boolean
  top?: boolean
  children: ReactNode
}) {
  return (
    <div className={`flex gap-3 ${top ? 'items-start' : 'items-center'}`}>
      <FieldLabel label={label} tip={tip} required={required} top={top} />
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  )
}

function FieldBlock({ error, children }: { error?: string; children: ReactNode }) {
  return <div className="space-y-1.5">{children}{error && <p className="text-xs text-destructive" role="alert">{error}</p>}</div>
}

function FieldLabel({ label, tip, required, top }: { label: string; tip?: string; required?: boolean; top?: boolean }) {
  return (
    <div className={`flex min-w-[100px] items-center justify-end gap-1 text-right ${top ? 'mt-2' : ''}`}>
      <Label>{required && <span className="mr-1 text-destructive">*</span>}{label}</Label>
      {tip && (
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger render={<button type="button" className="text-muted-foreground" aria-label={tip} />}><Info className="h-3.5 w-3.5" /></TooltipTrigger>
            <TooltipContent className="max-w-[300px]">{tip}</TooltipContent>
          </Tooltip>
        </TooltipProvider>
      )}
    </div>
  )
}

function RadioOption({ id, value, label }: { id: string; value: string; label: string }) {
  return <label htmlFor={id} className="flex cursor-pointer items-center gap-2 text-sm"><RadioGroupItem id={id} value={value} />{label}</label>
}

function ScopePicker({ placeholder, options, selected, onChange, testId }: {
  placeholder: string
  options: MailMarkingScope[]
  selected: string[]
  onChange: (value: string[]) => void
  testId: string
}) {
  const selectedOptions = selected.map((key) => options.find((option) => option.key === key) ?? { key, name: key, memberCount: null, kind: 'group' as const })
  return (
    <div className="space-y-2" data-testid={testId}>
      {selectedOptions.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {selectedOptions.map((option) => (
            <Badge key={option.key} variant="secondary" className="gap-1">
              {option.name}
              <button type="button" className="rounded-sm text-muted-foreground transition-[color] duration-[120ms] ease-out motion-reduce:transition-none hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60" aria-label={`remove ${option.name}`} onClick={() => onChange(selected.filter((key) => key !== option.key))}>
                <X className="h-3 w-3" />
              </button>
            </Badge>
          ))}
        </div>
      )}
      <Select value="" onValueChange={(value) => value && !selected.includes(value) && onChange([...selected, value])}>
        <SelectTrigger className="w-full data-[size=default]:h-9"><SelectValue placeholder={placeholder} /></SelectTrigger>
        <SelectContent>
          {options.filter((option) => !selected.includes(option.key)).map((option) => (
            <SelectItem key={option.key} value={option.key}>{option.name}{option.memberCount != null ? ` (${option.memberCount})` : ''}</SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )
}

function VariableBadges({ variables, onInsert }: { variables: readonly string[]; onInsert: (variable: string) => void }) {
  const t = useTranslations('mailMarking')
  return (
    <div className="mt-2 flex flex-wrap items-center gap-1.5" data-testid="mail-marking-variables">
      <span className="text-xs text-muted-foreground">{t('availableVariables')}:</span>
      {variables.map((variable) => (
        <button type="button" key={variable} className="rounded-md outline-none focus-visible:ring-2 focus-visible:ring-ring/60" onClick={() => onInsert(variable)}>
          <Badge variant="outline" className="cursor-pointer font-mono text-[11px] hover:bg-primary/10">{`{${variable}}`}</Badge>
        </button>
      ))}
    </div>
  )
}

function ColorField({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <div className="flex items-center gap-2">
      <Label className="text-sm">{label}:</Label>
      <Input type="color" className="h-8 w-12 p-1" value={isHex(value) ? value : '#000000'} onChange={(event) => onChange(event.target.value.toUpperCase())} />
      <Input className="w-24" value={value} onChange={(event) => onChange(event.target.value.toUpperCase())} />
    </div>
  )
}

function EmailPreview({ form, scopeNames }: { form: SaveMailMarkingPayload; scopeNames: Record<string, string> }) {
  const t = useTranslations('mailMarking')
  const scopes = [...form.departments, ...form.groups]
  const target = scopes.length > 0 ? (scopeNames[scopes[0]] ?? scopes[0]) : t('sampleRecipient')
  const isReceive = form.metadata.direction === 'receive'
  const mark = form.metadata.mark
  const disclaimer = form.metadata.disclaimer
  return (
    <div className="rounded-lg border bg-background p-4" data-testid="mail-marking-email-preview">
      <div className="mb-3 text-sm text-muted-foreground">
        <div>{t('previewFrom')}: {isReceive ? 'test@gmail.com' : 'sales@example.com'}</div>
        <div>{t('previewTo')}: {target}</div>
      </div>
      <div className="space-y-3 text-sm">
        {isReceive && mark && <MarkPreview block={mark} />}
        {!isReceive && disclaimer?.positions.includes('body_top') && <DisclaimerPreview block={disclaimer} />}
        <p>{t('sampleBody')}</p>
        {!isReceive && disclaimer?.positions.includes('body_bottom') && <div className="border-t border-dashed pt-3 text-xs text-muted-foreground"><DisclaimerPreview block={disclaimer} /></div>}
        {(isReceive ? mark?.positions.includes('header') : disclaimer?.positions.includes('header')) && (
          <div className="font-mono text-xs text-muted-foreground">{isReceive ? (mark?.header_name || 'X-External-Source') : (disclaimer?.header_name || 'X-Disclaimer')}: true</div>
        )}
      </div>
    </div>
  )
}

function emptyForm(direction: MailMarkingDirection, priority: number): SaveMailMarkingPayload {
  return {
    name: '', description: '', priority, is_active: true,
    metadata: direction === 'receive' ? structuredClone(DEFAULT_RECEIVE_METADATA) : structuredClone(DEFAULT_SEND_METADATA),
    departments: [], groups: [],
  }
}

function validate(form: SaveMailMarkingPayload, t: ReturnType<typeof useTranslations>): FormErrors {
  const errors: FormErrors = {}
  if (!form.name.trim()) errors.name = t('errorNameRequired')
  if (!Number.isInteger(form.priority) || form.priority < 1) errors.priority = t('errorPriorityPositive')
  if (form.metadata.direction === 'receive') {
    const mark = form.metadata.mark
    if (!mark?.text.trim()) errors.markText = t('errorMarkRequired')
    else if ([...mark.text].length > 50) errors.markText = t('errorMarkTooLong')
    if (mark?.positions.includes('header') && !mark.header_name?.trim()) errors.header = t('errorHeaderRequired')
    if (mark?.style === 'custom') {
      const colors = mark.custom_colors
      if (!colors || !isHex(colors.bg) || !isHex(colors.text) || !isHex(colors.border) || colors.radius < 0 || colors.radius > 20) {
        errors.colors = t('errorCustomColors')
      }
    }
  } else {
    const disclaimer = form.metadata.disclaimer
    if (!disclaimer?.content.trim()) errors.disclaimer = t('errorDisclaimerRequired')
    else if (new TextEncoder().encode(disclaimer.content).length > 10240) errors.disclaimer = t('errorDisclaimerTooLong')
    if (disclaimer?.positions.includes('header') && !disclaimer.header_name?.trim()) errors.header = t('errorHeaderRequired')
  }
  return errors
}

function isHex(value: string): boolean { return /^#[0-9A-Fa-f]{6}$/.test(value) }

function appendVariable(value: string, variable: string): string {
  return `${value}${value && !value.endsWith(' ') ? ' ' : ''}{${variable}}`
}

function markPositionChoice(positions: MarkPosition[]): PositionChoice {
  if (positions.includes('subject_prefix') && positions.includes('body_top')) return 'multiple'
  return positions[0] ?? 'body_top'
}
function markPositionsForChoice(choice: PositionChoice): MarkPosition[] {
  if (choice === 'multiple') return ['subject_prefix', 'body_top']
  return [choice as MarkPosition]
}
function disclaimerPositionChoice(positions: DisclaimerPosition[]): PositionChoice {
  if (positions.includes('body_top') && positions.includes('body_bottom')) return 'multiple'
  return positions[0] ?? 'body_bottom'
}
function disclaimerPositionsForChoice(choice: PositionChoice): DisclaimerPosition[] {
  if (choice === 'multiple') return ['body_top', 'body_bottom']
  return [choice as DisclaimerPosition]
}
