'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  FileText,
  HelpCircle,
  Lightbulb,
  Loader2,
  Mail,
  Paperclip,
  Play,
  Search,
  Zap,
  XCircle,
} from 'lucide-react';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetDescription,
  SheetTitle,
} from '@/components/ui/sheet';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Collapsible, CollapsibleContent } from '@/components/ui/collapsible';
import { CollapsibleSectionTrigger } from '@/components/ui/collapsible-section-trigger';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import {
  buildConditionTree,
  fromContentRuleUiAction,
  testContentRule,
  toContentRuleUiAction,
} from '@/lib/api/content-rules';
import { useApiRequest } from '@/lib/api/client';
import { useAuth } from '@/contexts/auth-context';
import { getRulePriorityRange } from '@/components/security/advanced-filter-rules/priority-range';
import type {
  ContentRuleDirections,
  ContentRuleFormData,
  ContentRuleRuleView,
  ContentRuleScope,
  ContentRuleUiAction,
} from '@/types/content-rules';
import type { Group } from '@/types/groups';

interface ContentRuleDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editingRule: ContentRuleRuleView | null;
  contentGroups: Group[];
  onSubmit: (data: ContentRuleFormData) => Promise<void>;
}

type ScopeChoice = 'subject' | 'body' | 'header' | 'attachment_names';
type FormErrors = Partial<Record<'name' | 'priority' | 'direction' | 'match_content' | 'regex' | 'scope' | 'header' | 'valid_until', string>>;

const ACTIONS: ContentRuleUiAction[] = [
  'deliver',
  'isolate',
  'review',
  'block',
  'discard',
];

const DEFAULT_HEADER_NAME = 'X-OSG-Content-Tag';
const DEFAULT_HEADER_VALUE = '[可疑]';

function defaultDraft(): ContentRuleFormData {
  return {
    name: '',
    description: '',
    priority: 100,
    is_active: true,
    valid_from: '',
    valid_until: '',
    match_type: 'keyword',
    match_content: '',
    scopes: ['subject', 'text_body', 'html_body'],
    directions: { receive: { enabled: true, action: 'quarantine' } },
  };
}

function firstEnabledAction(directions: ContentRuleDirections) {
  if (directions.receive?.enabled) return directions.receive.action;
  if (directions.send?.enabled) return directions.send.action;
  if (directions.internal?.enabled) return directions.internal.action;
  return 'quarantine' as const;
}

function cloneDirections(directions: ContentRuleDirections): ContentRuleDirections {
  const next: ContentRuleDirections = {};
  if (directions.receive?.enabled) next.receive = { ...directions.receive };
  if (directions.send?.enabled) next.send = { ...directions.send };
  if (directions.internal?.enabled) next.internal = { ...directions.internal };
  return next;
}

function makeInitialState(rule: ContentRuleRuleView | null) {
  if (!rule?.resolved) {
    return {
      draft: defaultDraft(),
      uiAction: 'isolate' as ContentRuleUiAction,
      headerName: DEFAULT_HEADER_NAME,
      headerValue: DEFAULT_HEADER_VALUE,
    };
  }
  const action = firstEnabledAction(rule.resolved.directions);
  const header = rule.resolved.mark_config?.add_headers?.[0];
  return {
    draft: {
      name: rule.rule.name,
      description: rule.rule.description ?? '',
      priority: rule.rule.priority,
      is_active: rule.rule.is_active,
      valid_from: rule.rule.valid_from ? rule.rule.valid_from.slice(0, 16) : '',
      valid_until: rule.rule.valid_until ? rule.rule.valid_until.slice(0, 10) : '',
      match_type: rule.resolved.match_type,
      match_content: rule.resolved.match_content,
      scopes: [...rule.resolved.scopes],
      directions: cloneDirections(rule.resolved.directions),
      mark_config: rule.resolved.mark_config,
      block_alert_config: rule.resolved.block_alert_config,
      email_type: rule.rule.email_type,
    },
    uiAction: toContentRuleUiAction(action, rule.resolved.mark_config),
    headerName: header?.name || DEFAULT_HEADER_NAME,
    headerValue: header?.value || DEFAULT_HEADER_VALUE,
  };
}

function serializeState(
  draft: ContentRuleFormData,
  uiAction: ContentRuleUiAction,
  headerName: string,
  headerValue: string,
) {
  return JSON.stringify({ draft, uiAction, headerName, headerValue });
}

export function ContentRuleDrawer({
  open,
  onOpenChange,
  editingRule,
  contentGroups,
  onSubmit,
}: ContentRuleDrawerProps) {
  const t = useTranslations();
  const { apiRequest } = useApiRequest();
  const { isSystemAdmin } = useAuth();
  const range = useMemo(() => getRulePriorityRange(isSystemAdmin), [isSystemAdmin]);
  const [draft, setDraft] = useState<ContentRuleFormData>(defaultDraft);
  const [uiAction, setUiAction] = useState<ContentRuleUiAction>('isolate');
  const [headerName, setHeaderName] = useState(DEFAULT_HEADER_NAME);
  const [headerValue, setHeaderValue] = useState(DEFAULT_HEADER_VALUE);
  const [actionTouched, setActionTouched] = useState(false);
  const [errors, setErrors] = useState<FormErrors>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [discardDialogOpen, setDiscardDialogOpen] = useState(false);
  const [testContent, setTestContent] = useState('');
  const [testMatch, setTestMatch] = useState<boolean | null>(null);
  const [testError, setTestError] = useState('');
  const [isTesting, setIsTesting] = useState(false);
  const [examplesOpen, setExamplesOpen] = useState(false);
  const [testOpen, setTestOpen] = useState(false);
  const initialState = useRef('');

  useEffect(() => {
    if (!open) return;
    const next = makeInitialState(editingRule);
    setDraft(next.draft);
    setUiAction(next.uiAction);
    setHeaderName(next.headerName);
    setHeaderValue(next.headerValue);
    initialState.current = serializeState(next.draft, next.uiAction, next.headerName, next.headerValue);
    setActionTouched(false);
    setErrors({});
    setTestContent('');
    setTestMatch(null);
    setTestError('');
    setExamplesOpen(false);
    setTestOpen(false);
  }, [editingRule, open]);

  const dirty = initialState.current !== serializeState(draft, uiAction, headerName, headerValue);

  const requestClose = useCallback(() => {
    if (dirty) {
      setDiscardDialogOpen(true);
      return;
    }
    onOpenChange(false);
  }, [dirty, onOpenChange]);

  const updateDirection = (direction: 'receive' | 'send' | 'internal', enabled: boolean) => {
    setDraft((current) => {
      const directions = { ...current.directions };
      if (enabled) {
        directions[direction] = {
          enabled: true,
          action: current.directions[direction]?.action ?? fromContentRuleUiAction(uiAction),
        };
      } else {
        delete directions[direction];
      }
      return { ...current, directions };
    });
    setErrors((current) => ({ ...current, direction: undefined }));
  };

  const updateAction = (next: ContentRuleUiAction) => {
    setUiAction(next);
    setActionTouched(true);
    const backendAction = fromContentRuleUiAction(next);
    setDraft((current) => ({
      ...current,
      directions: Object.fromEntries(
        Object.entries(current.directions).map(([direction, config]) => [
          direction,
          config?.enabled ? { enabled: true, action: backendAction } : config,
        ]),
      ) as ContentRuleDirections,
    }));
  };

  const selectedScope = (scope: ScopeChoice) => {
    if (scope === 'body') return draft.scopes.includes('text_body') || draft.scopes.includes('html_body');
    return draft.scopes.includes(scope);
  };

  const updateScope = (scope: ScopeChoice, checked: boolean) => {
    setDraft((current) => {
      let scopes = [...current.scopes];
      const targets: ContentRuleScope[] = scope === 'body' ? ['text_body', 'html_body'] : [scope];
      if (checked) {
        scopes = Array.from(new Set([...scopes, ...targets]));
      } else {
        scopes = scopes.filter((value) => !targets.includes(value));
      }
      return { ...current, scopes };
    });
    setErrors((current) => ({ ...current, scope: undefined }));
  };

  const regexError = useMemo(() => {
    if (draft.match_type !== 'regex' || !draft.match_content) return '';
    try {
      new RegExp(draft.match_content);
      return '';
    } catch {
      return t('contentRules.invalidRegex');
    }
  }, [draft.match_content, draft.match_type, t]);

  const validate = () => {
    const next: FormErrors = {};
    const name = draft.name.trim();
    if (!name) next.name = t('contentRules.ruleNameRequired');
    else if (name.length > 50) next.name = t('contentRules.ruleNameTooLong');
    else if (/[<>&"]/.test(name)) next.name = t('contentRules.ruleNameForbiddenChars');
    if (!Number.isInteger(draft.priority) || draft.priority < range.min || draft.priority > range.max) {
      next.priority = t('contentRules.priorityInvalid', { min: range.min, max: range.max });
    }
    if (!Object.values(draft.directions).some((config) => config?.enabled)) {
      next.direction = t('contentRules.atLeastOneDirection');
    }
    if (!draft.match_content.trim()) next.match_content = t('contentRules.matchContentRequired');
    if (regexError) next.regex = regexError;
    if (!draft.scopes.length) next.scope = t('contentRules.atLeastOneScope');
    if (uiAction === 'tag_deliver' && (!headerName.trim() || !headerValue.trim())) {
      next.header = t('contentRules.headerRequired');
    }
    if (draft.valid_until && Number.isNaN(new Date(draft.valid_until).getTime())) {
      next.valid_until = t('contentRules.invalidDate');
    }
    setErrors(next);
    if (Object.keys(next).length) toast.error(t('contentRules.formHasErrors'));
    return Object.keys(next).length === 0;
  };

  const handleSubmit = async () => {
    if (!validate()) return;
    setIsSubmitting(true);
    try {
      const backendAction = fromContentRuleUiAction(uiAction);
      const directions: ContentRuleDirections = {};
      for (const direction of ['receive', 'send', 'internal'] as const) {
        const config = draft.directions[direction];
        if (config?.enabled) {
          directions[direction] = {
            enabled: true,
            action: actionTouched ? backendAction : config.action,
          };
        }
      }
      await onSubmit({
        ...draft,
        name: draft.name.trim(),
        match_content: draft.match_content.trim(),
        directions,
        mark_config: uiAction === 'tag_deliver'
          ? {
              add_headers: [{ name: headerName.trim(), value: headerValue.trim() }],
              notify_admin: false,
              notify_sender: false,
            }
          : undefined,
        block_alert_config: actionTouched ? undefined : draft.block_alert_config,
      });
      initialState.current = serializeState(draft, uiAction, headerName, headerValue);
      onOpenChange(false);
    } catch {
      // The page-level submit handler owns the API error toast. Keep the drawer open.
    } finally {
      setIsSubmitting(false);
    }
  };

  const runTest = async () => {
    if (!testContent.trim()) {
      setTestError(t('contentRules.testContentRequired'));
      return;
    }
    if (!draft.match_content.trim() || regexError) return;
    setTestError('');
    setIsTesting(true);
    setTestMatch(null);
    try {
      const tree = buildConditionTree(draft);
      const attrs: Record<string, string> = {};
      for (const scope of draft.scopes) attrs[scope] = testContent;
      if (draft.match_type === 'content_group') {
        attrs.rcpttags = testContent.includes(draft.match_content) ? `grp:${draft.match_content}` : testContent;
      }
      if (draft.directions.receive?.enabled) {
        attrs.is_outbound = 'false';
        attrs.is_internal = 'false';
      } else if (draft.directions.send?.enabled) {
        attrs.is_outbound = 'true';
        attrs.is_internal = 'false';
      } else {
        attrs.is_outbound = 'true';
        attrs.is_internal = 'true';
      }
      const result = await testContentRule(tree, attrs, apiRequest);
      setTestMatch(result.matched);
    } catch {
      setTestMatch(false);
    } finally {
      setIsTesting(false);
    }
  };

  const legacyScopes = draft.scopes.filter((scope) => scope === 'attachment_types' || scope === 'urls');
  const actionLabel = (action: ContentRuleUiAction) => {
    const suffix = action.split('_').map((part) => part[0].toUpperCase() + part.slice(1)).join('');
    return t(`contentRules.action${suffix}` as 'contentRules.actionDeliver');
  };
  const actionHint = (action: ContentRuleUiAction) => {
    const suffix = action.split('_').map((part) => part[0].toUpperCase() + part.slice(1)).join('');
    return t(`contentRules.action${suffix}Hint` as 'contentRules.actionDeliverHint');
  };

  const applyExample = (
    matchType: ContentRuleFormData['match_type'],
    matchContent: string,
    scopes: ContentRuleScope[],
    action: ContentRuleUiAction,
  ) => {
    setDraft((current) => ({ ...current, match_type: matchType, match_content: matchContent, scopes }));
    updateAction(action);
    setErrors({});
    setTestMatch(null);
  };

  const directionDescription = (['receive', 'send', 'internal'] as const)
    .filter((direction) => draft.directions[direction]?.enabled)
    .map((direction) => t(`contentRules.direction${direction[0].toUpperCase() + direction.slice(1)}Value` as 'contentRules.directionReceiveValue'))
    .join('、') || t('contentRules.notSelected');

  const scopeDescription = (['subject', 'body', 'header', 'attachment_names'] as ScopeChoice[])
    .filter(selectedScope)
    .map((scope) => t(`contentRules.scopeDisplay${scope === 'attachment_names' ? 'AttachmentNames' : scope[0].toUpperCase() + scope.slice(1)}` as 'contentRules.scopeDisplaySubject'))
    .join('、') || t('contentRules.notSelected');

  return (
    <TooltipProvider>
      {/* Base UI portals their z-50 positioner outside this nested z-70 Sheet. */}
      <style>{`*:has(> [data-content-rule-layer="editor"]) { z-index: 80 !important; }`}</style>
      {open && <div aria-hidden className="pointer-events-none fixed inset-0 z-[60] bg-black/20" />}
      <Sheet open={open} onOpenChange={(next) => next ? onOpenChange(true) : requestClose()}>
        <SheetContent
          side="right"
          className="z-[70] bg-card data-[side=right]:w-[min(920px,calc(100vw-24px))] data-[side=right]:sm:max-w-[920px] gap-0 overflow-hidden p-0"
          data-testid="content-rule-drawer"
        >
          <SheetHeader className="flex-row items-center justify-between border-b px-6 py-4 pr-14">
            <div>
              <SheetTitle className="text-lg font-semibold">
                {editingRule ? t('contentRules.editRuleTitle') : t('contentRules.createRuleTitle')}
              </SheetTitle>
              <SheetDescription className="mt-1">{t('contentRules.editorSubtitle')}</SheetDescription>
            </div>
            <div className="flex items-center gap-2">
              <Button size="sm" variant="outline" onClick={requestClose}>{t('common.cancel')}</Button>
              <Button size="sm" onClick={handleSubmit} disabled={isSubmitting} data-testid="content-rule-save">
                {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {t('common.save')}
              </Button>
            </div>
          </SheetHeader>

          <div className="grid min-h-0 flex-1 grid-cols-[minmax(0,560px)_minmax(280px,1fr)] overflow-hidden max-[863px]:grid-cols-1">
            <div className="overflow-y-auto border-r p-6 max-[863px]:border-r-0 max-sm:p-4" data-testid="content-rule-form-pane">
              <div className="space-y-6">
                <Section title={t('contentRules.basicSettings')} accent="bg-blue-500" testId="content-rule-section-basic">
                  <Field label={t('contentRules.ruleName')} required error={errors.name} hint={t('contentRules.ruleNameTip')}>
                    <Input
                      data-testid="content-rule-name"
                      value={draft.name}
                      maxLength={50}
                      placeholder={t('contentRules.ruleNamePlaceholder')}
                      onChange={(event) => {
                        setDraft((current) => ({ ...current, name: event.target.value }));
                        setErrors((current) => ({ ...current, name: undefined }));
                      }}
                      className={cn(errors.name && 'border-destructive')}
                    />
                  </Field>
                  <Field label={t('contentRules.effectScope')} required error={errors.direction} hint={t('contentRules.effectScopeTip')}>
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 pt-1">
                      {(['receive', 'send', 'internal'] as const).map((direction) => (
                        <label key={direction} className="flex cursor-pointer items-center gap-2 whitespace-nowrap text-sm">
                          <Checkbox
                            checked={draft.directions[direction]?.enabled ?? false}
                            onCheckedChange={(checked) => updateDirection(direction, checked === true)}
                          />
                          <span>{t(`contentRules.direction${direction[0].toUpperCase() + direction.slice(1)}Full` as 'contentRules.directionReceiveFull')}</span>
                        </label>
                      ))}
                    </div>
                  </Field>
                  <Field
                    label={t('contentRules.priority')}
                    error={errors.priority}
                    hint={t('contentRules.tipPriority')}
                  >
                    <Input
                      data-testid="content-rule-priority"
                      type="number"
                      min={range.min}
                      max={range.max}
                      value={draft.priority}
                      onChange={(event) => setDraft((current) => ({ ...current, priority: Number(event.target.value) }))}
                      className="w-24"
                    />
                    <span className="ml-2 text-xs text-muted-foreground">{t('contentRules.priorityRangeHint', { min: range.min, max: range.max })}</span>
                  </Field>
                  <Field label={t('contentRules.effectiveUntil')} error={errors.valid_until} hint={t('contentRules.validUntilTip')}>
                    <div className="flex flex-wrap items-center gap-2">
                      <Input
                        type="date"
                        value={draft.valid_until ?? ''}
                        onChange={(event) => setDraft((current) => ({ ...current, valid_until: event.target.value }))}
                        className="w-40"
                      />
                      <span className="text-xs text-muted-foreground">({t('contentRules.permanentHint')})</span>
                    </div>
                  </Field>
                  {!actionTouched && editingRule && new Set(Object.values(draft.directions).filter(Boolean).map((item) => item?.action)).size > 1 && (
                    <p className="text-xs text-amber-600">{t('contentRules.mixedDirectionActionsPreserved')}</p>
                  )}
                </Section>

                <Section title={t('contentRules.matchCondition')} accent="bg-amber-500" testId="content-rule-section-match">
                  <Field label={t('contentRules.typeLabel')} required hint={t('contentRules.matchTypeTip')}>
                    <Select
                      value={draft.match_type}
                      onValueChange={(value) => {
                        if (!value) return;
                        setDraft((current) => ({ ...current, match_type: value as ContentRuleFormData['match_type'], match_content: '' }));
                        setErrors((current) => ({ ...current, match_content: undefined, regex: undefined }));
                      }}
                    >
                      <SelectTrigger className="w-48" data-testid="content-rule-match-type"><SelectValue /></SelectTrigger>
                      <SelectContent className="z-[80]" data-content-rule-layer="editor">
                        <SelectItem value="keyword">{t('contentRules.matchTypeKeyword')}</SelectItem>
                        <SelectItem value="regex">{t('contentRules.matchTypeRegex')}</SelectItem>
                        <SelectItem value="content_group">{t('contentRules.matchTypeContentGroup')}</SelectItem>
                      </SelectContent>
                    </Select>
                  </Field>
                  <Field
                    label={draft.match_type === 'content_group' ? t('contentRules.contentGroup') : t('contentRules.matchContent')}
                    required
                    error={errors.match_content || errors.regex || regexError}
                    hint={t('contentRules.matchContentTip')}
                    align="start"
                  >
                    {draft.match_type === 'content_group' ? (
                      <Select
                        value={draft.match_content}
                        onValueChange={(value) => setDraft((current) => ({ ...current, match_content: value ?? '' }))}
                      >
                        <SelectTrigger data-testid="content-rule-content-group"><SelectValue placeholder={t('contentRules.selectContentGroup')} /></SelectTrigger>
                        <SelectContent className="z-[80]" data-content-rule-layer="editor">
                          {contentGroups.map((group) => (
                            <SelectItem key={`${group.name}-${group.ruleId}`} value={group.name}>
                              {group.name}{group.memberCount != null ? ` (${group.memberCount})` : ''}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    ) : (
                      <Textarea
                        data-testid="content-rule-match-content"
                        value={draft.match_content}
                        placeholder={draft.match_type === 'regex' ? t('contentRules.regexPlaceholder') : t('contentRules.keywordPlaceholder')}
                        className={cn('min-h-20 font-mono text-sm', (errors.match_content || regexError) && 'border-destructive')}
                        onChange={(event) => {
                          setDraft((current) => ({ ...current, match_content: event.target.value }));
                          setErrors((current) => ({ ...current, match_content: undefined, regex: undefined }));
                        }}
                      />
                    )}
                    {draft.match_type === 'keyword' && (
                      <p className="mt-1 text-xs text-muted-foreground">{t('contentRules.keywordDividerHint')}</p>
                    )}
                  </Field>
                  <Field label={t('contentRules.applyTo')} required error={errors.scope} hint={t('contentRules.applyToTip')}>
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-3 pt-1">
                    {(['subject', 'body', 'header', 'attachment_names'] as ScopeChoice[]).map((scope) => (
                      <label key={scope} className="flex cursor-pointer items-center gap-2 whitespace-nowrap text-sm">
                        <Checkbox checked={selectedScope(scope)} onCheckedChange={(checked) => updateScope(scope, checked === true)} />
                        <span>{t(`contentRules.scopeDisplay${scope === 'attachment_names' ? 'AttachmentNames' : scope[0].toUpperCase() + scope.slice(1)}` as 'contentRules.scopeDisplaySubject')}</span>
                      </label>
                    ))}
                    <Tooltip>
                      <TooltipTrigger render={<span className="flex cursor-not-allowed items-center gap-2 whitespace-nowrap text-sm opacity-50" />}>
                        <Checkbox disabled checked={false} />
                        <span>{t('contentRules.scopeDisplayAttachmentContent')}</span>
                        <HelpCircle className="h-3.5 w-3.5" />
                      </TooltipTrigger>
                      <TooltipContent className="z-[80]" data-content-rule-layer="editor">{t('contentRules.attachmentContentUnavailable')}</TooltipContent>
                    </Tooltip>
                    </div>
                  </Field>
                  {legacyScopes.length > 0 && (
                    <p className="text-xs text-muted-foreground">
                      {t('contentRules.legacyScopesPreserved', { count: legacyScopes.length })}
                    </p>
                  )}
                </Section>

                <Section title={t('contentRules.actionSection')} accent="bg-red-500" testId="content-rule-section-action">
                  <Field label={t('contentRules.actionSection')} required hint={t('contentRules.actionTip')}>
                    <Select value={uiAction} onValueChange={(value) => value && updateAction(value as ContentRuleUiAction)}>
                      <SelectTrigger className={cn('w-full', actionTextClass(uiAction))} data-testid="content-rule-action">
                        <SelectValue aria-label={uiAction}>
                          <span className={actionTextClass(uiAction)}>{actionLabel(uiAction)}</span>
                        </SelectValue>
                      </SelectTrigger>
                      <SelectContent className="z-[80]" data-content-rule-layer="editor">
                        {ACTIONS.map((action) => (
                          <SelectItem key={action} value={action} className="items-start">
                            <span className="flex flex-col gap-0.5">
                              <span className={actionTextClass(action)}>{actionLabel(action)}</span>
                              <span className="text-xs text-muted-foreground">{actionHint(action)}</span>
                            </span>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <p className="mt-2 text-xs text-muted-foreground">{t('contentRules.actionHint')}</p>
                  </Field>
                  {uiAction === 'tag_deliver' && (
                    <div className="grid grid-cols-[100px_minmax(0,1fr)] gap-3">
                      <span />
                      <div className="space-y-3 rounded-md border border-dashed border-cyan-300 bg-cyan-50/40 p-4 dark:border-cyan-800 dark:bg-cyan-950/20">
                        <p className="text-xs text-muted-foreground">{t('contentRules.headerOnlyTagHint')}</p>
                        <div className="grid grid-cols-2 gap-3 max-sm:grid-cols-1">
                          <div className="space-y-1">
                            <Label>{t('contentRules.headerName')}</Label>
                            <Input value={headerName} onChange={(event) => setHeaderName(event.target.value)} />
                          </div>
                          <div className="space-y-1">
                            <Label>{t('contentRules.headerValue')}</Label>
                            <Input value={headerValue} onChange={(event) => setHeaderValue(event.target.value)} />
                          </div>
                        </div>
                        {errors.header && <p className="text-xs text-destructive">{errors.header}</p>}
                      </div>
                    </div>
                  )}
                </Section>

                <Section title={t('contentRules.remarkTitle')} accent="bg-gray-400" testId="content-rule-section-remark">
                  <Textarea
                    data-testid="content-rule-description"
                    value={draft.description ?? ''}
                    maxLength={200}
                    placeholder={t('contentRules.remarkPlaceholder')}
                    className="min-h-20"
                    onChange={(event) => setDraft((current) => ({ ...current, description: event.target.value }))}
                  />
                  <div className="text-right text-xs text-muted-foreground">{draft.description?.length ?? 0}/200</div>
                </Section>
              </div>
            </div>

            <aside className="overflow-y-auto bg-muted/60 p-6 max-[863px]:hidden" data-testid="content-rule-help-pane">
              <div className="space-y-6">
                <div className="rounded-lg border bg-card p-5" data-testid="content-rule-current-effect">
                  <div className="mb-4 flex items-center gap-2">
                    <Zap className="h-4 w-4 text-blue-500" />
                    <h3 className="font-medium">{t('contentRules.currentEffect')}</h3>
                  </div>
                  <div className="space-y-3 text-sm">
                    <PreviewRow icon={<FileText className="h-4 w-4" />} label={t('contentRules.ruleName')} value={<span className="font-medium">{draft.name || t('contentRules.notFilled')}</span>} />
                    <PreviewRow icon={<Mail className="h-4 w-4" />} label={t('contentRules.effectScope')} value={directionDescription} />
                    <PreviewRow icon={<Search className="h-4 w-4" />} label={t('contentRules.matchContent')} value={<span className="break-all font-mono text-xs">{draft.match_content || t('contentRules.notFilled')}</span>} />
                    <PreviewRow icon={<Paperclip className="h-4 w-4" />} label={t('contentRules.applyTo')} value={scopeDescription} />
                    <PreviewRow icon={<AlertTriangle className="h-4 w-4" />} label={t('contentRules.actionSection')} value={<Badge className={cn('ml-1 text-xs', actionBadgeClass(uiAction))}>{actionLabel(uiAction)}</Badge>} />
                    <PreviewRow icon={<Zap className="h-4 w-4" />} label={t('contentRules.priority')} value={<Badge variant="outline" className="ml-1 font-mono">{draft.priority}</Badge>} />
                    <PreviewRow icon={<Clock className="h-4 w-4" />} label={t('contentRules.effectiveUntil')} value={draft.valid_until ? new Date(draft.valid_until).toLocaleDateString() : t('contentRules.permanent')} />
                  </div>
                </div>

                <Collapsible open={examplesOpen} onOpenChange={setExamplesOpen}>
                  <CollapsibleSectionTrigger className="h-9">
                    <Lightbulb className="h-4 w-4" />{t('contentRules.viewExamples')}
                  </CollapsibleSectionTrigger>
                  <CollapsibleContent className="mt-3 space-y-2">
                    <ExampleButton title={t('contentRules.exampleKeywordReject')} description={t('contentRules.exampleKeywordRejectDesc')} applyLabel={t('contentRules.applyExample')} onClick={() => applyExample('regex', '\\d{17}[\\dXx]', ['text_body', 'html_body'], 'block')} />
                    <ExampleButton title={t('contentRules.exampleRegexQuarantine')} description={t('contentRules.exampleRegexQuarantineDesc')} applyLabel={t('contentRules.applyExample')} onClick={() => applyExample('regex', '\\d{16,19}', ['text_body', 'html_body'], 'review')} />
                    <ExampleButton title={t('contentRules.exampleContentGroupAudit')} description={t('contentRules.exampleContentGroupAuditDesc')} applyLabel={t('contentRules.applyExample')} onClick={() => applyExample('keyword', '敏感词1|敏感词2', ['subject', 'text_body', 'html_body'], 'block')} />
                  </CollapsibleContent>
                </Collapsible>

                <Collapsible open={testOpen} onOpenChange={setTestOpen}>
                  {/* 柔和交互反馈规格 §2.3：语义绿不作装饰用途，模拟测试触发器与其余折叠区
                      统一走共享触发器的 primary 文字 + muted 表面。 */}
                  <CollapsibleSectionTrigger className="h-9">
                    <Play className="h-4 w-4" />{t('contentRules.simulateTest')}
                  </CollapsibleSectionTrigger>
                  <CollapsibleContent className="mt-3 rounded-lg border bg-card p-4">
                    <Textarea
                      value={testContent}
                      onChange={(event) => { setTestContent(event.target.value); setTestMatch(null); setTestError(''); }}
                      placeholder={t('contentRules.testContent')}
                      className="min-h-24"
                    />
                    {testError && <p className="mt-1 text-xs text-destructive">{testError}</p>}
                    <Button className="mt-3 w-full" variant="outline" onClick={runTest} disabled={isTesting}>
                      {isTesting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                      {t('contentRules.runTest')}
                    </Button>
                    {testMatch !== null && (
                      <div className={cn(
                        'mt-3 flex items-center gap-2 rounded-lg border p-3 text-sm',
                        testMatch ? 'border-rose-200 bg-rose-50 text-rose-700' : 'border-emerald-200 bg-emerald-50 text-emerald-700',
                      )}>
                        {testMatch ? <XCircle className="h-4 w-4" /> : <CheckCircle2 className="h-4 w-4" />}
                        {testMatch ? t('contentRules.testMatched') : t('contentRules.testNotMatched')}
                      </div>
                    )}
                  </CollapsibleContent>
                </Collapsible>

                <div className="rounded-lg border border-blue-200 bg-blue-50/70 p-4 text-xs text-blue-600 dark:border-blue-800 dark:bg-blue-950/30 dark:text-blue-400">
                  <div className="mb-2 flex items-center gap-2 font-medium text-blue-700 dark:text-blue-300"><HelpCircle className="h-4 w-4" />{t('contentRules.tips')}</div>
                  <p>- {t('contentRules.tipPriority')}</p>
                  <p className="mt-1.5">- {t('contentRules.tipRegex')}</p>
                  <p className="mt-1.5">- {t('contentRules.tipKeyword')}</p>
                  <p className="mt-1.5">- {t('contentRules.tipScopes')}</p>
                  <p className="mt-1.5">- {t('contentRules.tipSimulator')}</p>
                </div>
              </div>
            </aside>
          </div>
        </SheetContent>
      </Sheet>

      <AlertDialog open={discardDialogOpen} onOpenChange={setDiscardDialogOpen}>
        <AlertDialogContent className="z-[90]">
          <AlertDialogHeader>
            <AlertDialogTitle>{t('contentRules.unsavedTitle')}</AlertDialogTitle>
            <AlertDialogDescription>{t('contentRules.unsavedDescription')}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() => {
                setDiscardDialogOpen(false);
                onOpenChange(false);
              }}
            >
              {t('contentRules.discardChanges')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </TooltipProvider>
  );
}

function Section({
  title,
  accent,
  error,
  testId,
  children,
}: {
  title: string;
  accent: string;
  error?: string;
  testId?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-lg bg-muted/40 p-5" data-testid={testId}>
      <div className="mb-4 flex items-center gap-2">
        <span className={cn('h-5 w-1 rounded-full', accent)} />
        <h3 className="font-medium">{title}</h3>
      </div>
      <div className="space-y-4">{children}</div>
      {error && <p className="mt-2 text-xs text-destructive">{error}</p>}
    </section>
  );
}

function Field({
  label,
  required,
  hint,
  error,
  align = 'center',
  children,
}: {
  label: string;
  required?: boolean;
  hint?: string;
  error?: string;
  align?: 'start' | 'center';
  children: React.ReactNode;
}) {
  return (
    <div className={cn('grid grid-cols-[100px_minmax(0,1fr)] gap-3', align === 'center' ? 'items-center' : 'items-start')}>
      <Label className={cn('flex items-center justify-end gap-1 text-right', align === 'start' && 'pt-2')}>
        {required && <span className="text-destructive">*</span>}
        {label}
        {hint && (
          <Tooltip>
            <TooltipTrigger render={<HelpCircle className="h-3.5 w-3.5 text-muted-foreground" />} />
            <TooltipContent className="z-[80]" data-content-rule-layer="editor">{hint}</TooltipContent>
          </Tooltip>
        )}
      </Label>
      <div>
        {children}
        {error && <p className="mt-1 text-xs text-destructive">{error}</p>}
      </div>
    </div>
  );
}

function actionTextClass(action: ContentRuleUiAction) {
  switch (action) {
    case 'deliver': return 'text-emerald-600 dark:text-emerald-400';
    case 'tag_deliver': return 'text-cyan-600 dark:text-cyan-400';
    case 'isolate': return 'text-orange-600 dark:text-orange-400';
    case 'review': return 'text-amber-600 dark:text-amber-400';
    case 'block': return 'text-red-600 dark:text-red-400';
    case 'discard': return 'text-slate-600 dark:text-slate-300';
  }
}

function actionBadgeClass(action: ContentRuleUiAction) {
  switch (action) {
    case 'deliver': return 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300';
    case 'tag_deliver': return 'bg-cyan-100 text-cyan-700 dark:bg-cyan-950 dark:text-cyan-300';
    case 'isolate': return 'bg-orange-100 text-orange-700 dark:bg-orange-950 dark:text-orange-300';
    case 'review': return 'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300';
    case 'block': return 'bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300';
    case 'discard': return 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200';
  }
}

function PreviewRow({ icon, label, value }: { icon: React.ReactNode; label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-start gap-2">
      <span className="mt-0.5 text-muted-foreground">{icon}</span>
      <div className="min-w-0">
        <span className="text-muted-foreground">{label}:</span>
        <span className="ml-2">{value}</span>
      </div>
    </div>
  );
}

function ExampleButton({ title, description, applyLabel, onClick }: { title: string; description: string; applyLabel: string; onClick: () => void }) {
  return (
    <div className="flex w-full items-start gap-2 rounded-lg border bg-card p-3 text-left">
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-medium">{title}</span>
        <span className="mt-0.5 block text-xs text-muted-foreground">{description}</span>
      </span>
      <Button type="button" variant="ghost" size="sm" onClick={onClick}>{applyLabel}</Button>
    </div>
  );
}
