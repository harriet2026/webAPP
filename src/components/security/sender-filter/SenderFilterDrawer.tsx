'use client';

import { useTranslations } from 'next-intl';
import { Loader2, ChevronDown, ChevronUp, HelpCircle, Zap, Shield, Ban, Clock, Lightbulb, Play, Check, X } from 'lucide-react';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import { useAuth } from '@/contexts/auth-context';
import type {
  SenderFilterRuleView,
  SenderFilterFormData,
  SenderFilterGroups,
  SenderFilterSenderConfig,
  SenderConfigType,
  IPRangeType,
  ListType,
  WhitelistMode,
  SenderFilterAction,
} from '@/types/sender-filter';
import { normalizeDomain } from '@/lib/api/sender-filter';
import { getSenderFilterDefaultPriority } from './priority-defaults';
import { getRulePriorityRange } from '../advanced-filter-rules/priority-range';

// GT-12693：默认值实现已提取到 priority-defaults.ts，便于与后端
// validatePriority 的角色范围一起被单测锁住。
const getDefaultPriority = getSenderFilterDefaultPriority;

/** 域名输入框：自由输入 + 租户接收域名快捷建议 */
interface DomainComboboxProps {
  value: string;
  suggestions: string[];
  placeholder: string;
  suggestionsLabel: string;
  hasError: boolean;
  onChange: (value: string) => void;
}

function DomainCombobox({ value, suggestions, placeholder, suggestionsLabel, hasError, onChange }: DomainComboboxProps) {
  const [open, setOpen] = useState(false);
  const [inputValue, setInputValue] = useState(value);
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // 同步外部 value → 内部 inputValue（切换类型时重置）
  useEffect(() => {
    setInputValue(value);
  }, [value]);

  // 点击外部关闭建议
  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [open]);

  // 过滤建议：只展示包含输入词的项
  const filtered = useMemo(() => {
    if (!inputValue.trim()) return suggestions;
    const lower = inputValue.toLowerCase();
    return suggestions.filter((d) => d.toLowerCase().includes(lower));
  }, [suggestions, inputValue]);

  function handleInput(e: React.ChangeEvent<HTMLInputElement>) {
    const raw = e.target.value.toLowerCase().replace(/\s/g, '');
    setInputValue(raw);
    onChange(raw);
    setOpen(suggestions.length > 0);
  }

  function handleSelectSuggestion(domain: string) {
    setInputValue(domain);
    onChange(domain);
    setOpen(false);
    inputRef.current?.focus();
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Escape') setOpen(false);
    if (e.key === 'Enter') { e.preventDefault(); setOpen(false); }
  }

  return (
    <div ref={containerRef} className="relative flex-1">
      <Input
        ref={inputRef}
        className="w-full"
        value={inputValue}
        placeholder={placeholder}
        aria-invalid={hasError}
        aria-autocomplete="list"
        aria-expanded={open}
        data-testid="sender-filter-domain-input"
        onChange={handleInput}
        onFocus={() => suggestions.length > 0 && setOpen(true)}
        onKeyDown={handleKeyDown}
      />
      {open && filtered.length > 0 && (
        <div className="absolute z-50 left-0 right-0 top-full mt-1 rounded-md border bg-popover shadow-md overflow-hidden">
          {suggestionsLabel && (
            <div className="px-3 py-1.5 text-xs text-muted-foreground border-b">{suggestionsLabel}</div>
          )}
          <ul role="listbox" data-testid="sender-filter-domain-suggestions" className="max-h-48 overflow-y-auto py-1">
            {filtered.map((domain) => (
              <li
                key={domain}
                role="option"
                aria-selected={domain === inputValue}
                className={cn(
                  'px-3 py-1.5 text-sm cursor-pointer hover:bg-accent hover:text-accent-foreground',
                  domain === inputValue && 'bg-accent/50',
                )}
                onMouseDown={(e) => { e.preventDefault(); handleSelectSuggestion(domain); }}
              >
                {domain}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const domainRegex = /^(?:[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\.)*[a-zA-Z]{2,}$/;

/**
 * Every key the schema can put in a zod `message`. They are looked up under the
 * `senderFilter.errors` namespace at render time — a message is never shown to
 * the user as-is (GT-11892 shipped `nameRequired` and `valueRequired` verbatim,
 * and two bare English sentences that no locale could translate).
 *
 * The start-date branch remains removed by the demo rewrite. The blacklist-only
 * / whitelist-only action linkage is guaranteed by the
 * action Select's option set (it only offers `accept` for a whitelist rule and
 * only reject/quarantine/audit for a blacklist rule), so no zod guard is needed.
 */
export const senderFilterErrorKeys = [
  'nameRequired',
  'nameMaxLength',
  'nameDuplicate',
  'descriptionMaxLength',
  // GT-12693：优先级校验改为按角色范围构造，统一发 priorityRange 一个键（带
  // {min}/{max} 参数），旧的 priorityMin/priorityMax 已不再被 schema 发出，
  // 四语文案也随之替换 —— 声明必须跟着改，否则 i18n 守卫会一直红。
  'priorityRange',
  'whitelistModeRequired',
  'invalidEmail',
  'invalidDomain',
  'selectGroup',
  'senderValueRequired',
  'ipValueRequired',
  'invalidIp',
  'invalidCidr',
  'cidrPrefixMax',
] as const;

const ruleSchema = z.object({
  name: z.string().min(1, 'nameRequired').max(50, 'nameMaxLength'),
  description: z.string().max(200, 'descriptionMaxLength').optional(),
  // GT-12693：占位。真实上下界依赖登录角色（后端 validatePriority 对
  // tenant_admin 收窄到 100-1000），由下面的 makeRuleSchema 覆盖。
  priority: z.number().int(),
  is_active: z.boolean(),
  valid_until: z.string().optional(),
  list_type: z.enum(['blacklist', 'whitelist']),
  action: z.enum(['accept', 'reject', 'quarantine', 'audit']),
  whitelist_mode: z.enum(['bypass_content', 'direct_deliver']).optional(),
  // GT-11486: 复杂规则编辑态——条件/动作字段隐藏且不参与提交，
  // superRefine 的条件类校验对其全部跳过（只校验基础字段）。
  is_complex: z.boolean().optional(),
  sender_config: z.object({
    type: z.enum(['individual', 'domain', 'group']),
    value: z.string(),
  }),
  ip_range: z.object({
    type: z.enum(['all', 'single', 'range', 'ipGroup']),
    value: z.string().optional(),
  }),
}).superRefine((data, ctx) => {
  if (data.is_complex) return;
  if (data.list_type === 'whitelist' && !data.whitelist_mode) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['whitelist_mode'], message: 'whitelistModeRequired' });
  }
  if (data.sender_config.type === 'individual' && data.sender_config.value) {
    if (!emailRegex.test(data.sender_config.value)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['sender_config', 'value'], message: 'invalidEmail' });
    }
  }
  if (data.sender_config.type === 'domain' && data.sender_config.value) {
    if (!domainRegex.test(data.sender_config.value)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['sender_config', 'value'], message: 'invalidDomain' });
    }
  }
  if (data.sender_config.type === 'group' && !data.sender_config.value) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['sender_config', 'value'], message: 'selectGroup' });
  }
  if (data.sender_config.type !== 'group' && !data.sender_config.value) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['sender_config', 'value'], message: 'senderValueRequired' });
  }
  if (data.ip_range.type === 'single' && data.ip_range.value) {
    const parts = data.ip_range.value.split('.');
    if (parts.length !== 4 || !parts.every((p) => /^\d{1,3}$/.test(p) && Number(p) >= 0 && Number(p) <= 255)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['ip_range', 'value'], message: 'invalidIp' });
    }
  }
  if (data.ip_range.type === 'range' && data.ip_range.value) {
    const [ipStr, prefixStr, extra] = data.ip_range.value.split('/');
    if (!ipStr || !prefixStr || extra !== undefined || !/^\d+$/.test(prefixStr)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['ip_range', 'value'], message: 'invalidCidr' });
    } else {
      const ipParts = ipStr.split('.');
      const validIP = ipParts.length === 4 && ipParts.every((p) => /^\d{1,3}$/.test(p) && Number(p) >= 0 && Number(p) <= 255);
      if (!validIP) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['ip_range', 'value'], message: 'invalidCidr' });
      } else {
        const prefix = +prefixStr;
        if (prefix < 0 || prefix > 32) {
          ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['ip_range', 'value'], message: 'cidrPrefixMax' });
        }
      }
    }
  }
  if (data.ip_range.type === 'single' && !data.ip_range.value) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['ip_range', 'value'], message: 'ipValueRequired' });
  }
  if (data.ip_range.type === 'range' && !data.ip_range.value) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['ip_range', 'value'], message: 'ipValueRequired' });
  }
  if (data.ip_range.type === 'ipGroup' && !data.ip_range.value) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['ip_range', 'value'], message: 'selectGroup' });
  }
});

type RuleForm = z.infer<typeof ruleSchema>;

// GT-12693：优先级范围随登录角色变化，而 zod schema 是模块级常量拿不到角色，
// 故按范围构造。错误信息用统一的 priorityRange 键 + 参数，避免把 1/9999 之类
// 的数字写死在四语文案里（写死的话，角色一变文案就撒谎）。
function makeRuleSchema(range: { min: number; max: number }) {
  // ruleSchema 带 superRefine，zod v4 要求用 safeExtend 覆盖字段。
  return ruleSchema.safeExtend({
    priority: z
      .number()
      .int()
      .min(range.min, 'priorityRange')
      .max(range.max, 'priorityRange'),
  });
}

/**
 * Local, API-free simulation (replaces the old `testSenderFilterRule` round
 * trip). Matches the demo's `runSimulation`: an individual rule hits on exact
 * match or a `*@domain` wildcard suffix; a domain rule hits when the tested
 * address's host equals the normalized rule domain. Group rules cannot be
 * evaluated locally (their membership lives server-side) — the caller shows
 * `simGroupNotice` instead of calling this.
 */
function localSimulate(email: string, sc: SenderFilterSenderConfig): boolean {
  if (!email) return false;
  if (sc.type === 'individual') {
    return email === sc.value || (sc.value.startsWith('*@') && email.endsWith(sc.value.slice(1)));
  }
  if (sc.type === 'domain') {
    return email.includes('@') && email.split('@').pop() === normalizeDomain(sc.value);
  }
  return false;
}

interface SenderFilterDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editingRule: SenderFilterRuleView | null;
  listTypeTab: ListType;
  groups: SenderFilterGroups;
  /** GT-12117: 当前租户的接收域名列表，组织域名类型下拉的选项来源。 */
  tenantDomains: string[];
  onSubmit: (data: SenderFilterFormData) => Promise<void>;
}

export function SenderFilterDrawer({
  open,
  onOpenChange,
  editingRule,
  listTypeTab,
  groups,
  tenantDomains,
  onSubmit,
}: SenderFilterDrawerProps) {
  const t = useTranslations();
  // GT-12693：优先级的可填范围随登录角色变化——后端 validatePriority 把
  // tenant_admin 收窄到 100-1000，平台管理员保留 0-9999。此前这里写死
  // 1-9999，租户管理员手改优先级必然 400。
  const { isSystemAdmin } = useAuth();
  const priorityRange = useMemo(() => getRulePriorityRange(isSystemAdmin), [isSystemAdmin]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showExamples, setShowExamples] = useState(false);
  const [showSimulation, setShowSimulation] = useState(false);
  const [simEmail, setSimEmail] = useState('test@example.com');
  const [simMatch, setSimMatch] = useState<boolean | 'group_notice' | null>(null);

  const form = useForm<RuleForm>({
    resolver: zodResolver(makeRuleSchema(priorityRange)),
    defaultValues: {
      name: '',
      description: '',
      priority: 500,
      is_active: true,
      valid_until: '',
      list_type: 'blacklist',
      action: 'reject',
      whitelist_mode: undefined,
      sender_config: { type: 'individual', value: '' },
      ip_range: { type: 'all', value: undefined },
    },
  });

  const resetForm = useCallback(
    (rule?: SenderFilterRuleView) => {
      if (rule && rule.resolved) {
        form.reset({
          name: rule.rule.name,
          description: rule.rule.description || '',
          priority: rule.rule.priority,
          is_active: rule.rule.is_active,
          // date-only field: keep the YYYY-MM-DD head of any stored timestamp.
          valid_until: rule.rule.valid_until ? rule.rule.valid_until.slice(0, 10) : '',
          list_type: rule.resolved.list_type,
          action: (rule.rule.action || 'reject') as SenderFilterAction,
          whitelist_mode: rule.resolved.whitelist_mode,
          sender_config: { ...rule.resolved.sender_config },
          ip_range: { ...rule.resolved.ip_range },
          is_complex: false,
        });
      } else if (rule) {
        // GT-11486: 复杂规则（resolved===null）此前落进"新建"分支，抽屉呈
        // 空白新建态。回填全部基础字段；条件/动作以只读方式展示原始定义。
        form.reset({
          name: rule.rule.name,
          description: rule.rule.description || '',
          priority: rule.rule.priority,
          is_active: rule.rule.is_active,
          valid_until: rule.rule.valid_until ? rule.rule.valid_until.slice(0, 10) : '',
          list_type: rule.list_type,
          action: (rule.rule.action || 'reject') as SenderFilterAction,
          whitelist_mode: undefined,
          sender_config: { type: 'individual', value: '' },
          ip_range: { type: 'all', value: undefined },
          is_complex: true,
        });
      } else {
        const whitelistMode = listTypeTab === 'whitelist' ? 'bypass_content' : undefined;
        form.reset({
          name: '',
          description: '',
          priority: getDefaultPriority(listTypeTab, whitelistMode),
          is_active: true,
          valid_until: '',
          list_type: listTypeTab,
          action: listTypeTab === 'whitelist' ? 'accept' : 'reject',
          whitelist_mode: whitelistMode,
          sender_config: { type: 'individual', value: '' },
          ip_range: { type: 'all', value: undefined },
          is_complex: false,
        });
      }
      setShowExamples(false);
      setShowSimulation(false);
      setSimEmail('test@example.com');
      setSimMatch(null);
    },
    [form, listTypeTab],
  );

  useEffect(() => {
    if (open) {
      resetForm(editingRule ?? undefined);
    }
  }, [open, editingRule, resetForm]);

  const handleOpenChange = useCallback(
    (val: boolean) => {
      if (!val && form.formState.isDirty) {
        const ok = window.confirm(t('senderFilter.unsavedChanges'));
        if (!ok) return;
      }
      onOpenChange(val);
    },
    [onOpenChange, form.formState.isDirty, t],
  );

  const handleSubmit = form.handleSubmit(async (data) => {
    setIsSubmitting(true);
    try {
      const formData: SenderFilterFormData = {
        ...data,
        whitelist_mode: data.list_type === 'whitelist' ? data.whitelist_mode : undefined,
      };
      await onSubmit(formData);
      onOpenChange(false);
    } catch (err) {
      // GT-11685: 重名冲突（409）在规则名称字段行内提示；其余错误由父级 toast。
      if ((err as { status?: number })?.status === 409) {
        form.setError('name', { type: 'server', message: 'nameDuplicate' });
      }
    } finally {
      setIsSubmitting(false);
    }
  });

  // GT-11486: 复杂规则编辑态——条件在简易抽屉不可编辑，改为只读展示。
  const isComplexEdit = !!editingRule?.is_complex;
  const complexRawCondition = useMemo(() => {
    if (!isComplexEdit || !editingRule) return '';
    const raw = editingRule.rule.condition_tree;
    try {
      return JSON.stringify(typeof raw === 'string' ? JSON.parse(raw) : raw, null, 2);
    } catch {
      return typeof raw === 'string' ? raw : '';
    }
  }, [isComplexEdit, editingRule]);

  const watchListType = form.watch('list_type');
  const watchSenderType = form.watch('sender_config.type');
  const watchIpType = form.watch('ip_range.type');
  const watchAction = form.watch('action');
  const watchWhitelistMode = form.watch('whitelist_mode');
  const watchSenderValue = form.watch('sender_config.value');
  const watchPriority = form.watch('priority');
  const watchValidUntil = form.watch('valid_until');
  const descLength = form.watch('description')?.length ?? 0;

  useEffect(() => {
    setSimMatch(null);
  }, [simEmail, watchSenderType, watchSenderValue]);

  const runSimulation = useCallback(() => {
    if (watchSenderType === 'group') {
      setSimMatch('group_notice');
      return;
    }
    setSimMatch(localSimulate(simEmail, form.getValues('sender_config')));
  }, [form, simEmail, watchSenderType]);

  const senderTypeLabel: Record<SenderConfigType, string> = {
    individual: t('senderFilter.senderType_individual'),
    domain: t('senderFilter.senderType_domain'),
    group: t('senderFilter.senderType_group'),
  };
  const ipTypeLabel: Record<IPRangeType, string> = {
    all: t('senderFilter.ipType_all'),
    single: t('senderFilter.ipType_single'),
    range: t('senderFilter.ipType_range'),
    ipGroup: t('senderFilter.ipType_ipGroup'),
  };
  const actionLabel: Record<SenderFilterAction, string> = {
    reject: t('senderFilter.action_reject'),
    quarantine: t('senderFilter.action_quarantine'),
    audit: t('senderFilter.action_audit'),
    accept: t('senderFilter.action_accept'),
  };

  const labelCls = 'min-w-[100px] w-[100px] shrink-0 whitespace-nowrap text-right';

  return (
    <Sheet open={open} onOpenChange={handleOpenChange}>
      <SheetContent
        side="right"
        className="data-[side=right]:w-[920px] data-[side=right]:sm:max-w-[920px] p-0 flex flex-col"
        showCloseButton
      >
        <SheetHeader className="px-6 py-4 border-b flex-shrink-0">
          <SheetTitle className="text-lg font-semibold">
            {t(editingRule ? 'senderFilter.editRule' : 'senderFilter.createRule')}
          </SheetTitle>
          <p className="text-sm text-muted-foreground mt-1">
            {t(watchListType === 'whitelist' ? 'senderFilter.drawerSubtitleWhitelist' : 'senderFilter.drawerSubtitleBlacklist')}
          </p>
        </SheetHeader>

        <div className="flex flex-1 overflow-hidden">
          {/* Left column: form */}
          <div className="w-[560px] flex-shrink-0 overflow-y-auto p-6 border-r">
            <form id="sender-filter-form" onSubmit={handleSubmit}>
              <TooltipProvider>
                <div className="space-y-6">
                  {/* 基础设置 */}
                  <div className="rounded-lg border bg-muted/30 p-5">
                    <div className="flex items-center gap-2 mb-4">
                      <div className="h-5 w-1 rounded-full bg-primary" />
                      <h3 className="font-medium">{t('senderFilter.sectionBasic')}</h3>
                    </div>

                    <div className="space-y-4">
                      {/* 规则名称 */}
                      <div className="flex items-start gap-3">
                        <Label htmlFor="sender-filter-rule-name" className={cn(labelCls, 'pt-2')}>
                          <span className="text-destructive">*</span> {t('senderFilter.ruleName')}
                        </Label>
                        <div className="flex-1">
                          <Input
                            id="sender-filter-rule-name"
                            {...form.register('name')}
                            aria-invalid={!!form.formState.errors.name}
                          />
                          {form.formState.errors.name && (
                            <p className="text-xs text-destructive mt-1">{t(`senderFilter.errors.${form.formState.errors.name.message}`)}</p>
                          )}
                        </div>
                      </div>

                      {isComplexEdit ? (
                        /* GT-11486: 复杂规则（高级编辑器/API 创建）的条件在
                           简易抽屉不可编辑——只读展示原始条件定义，保存仅更新
                           基础字段，不覆写条件与动作。 */
                        <div className="flex items-start gap-3">
                          <Label className={cn(labelCls, 'pt-2')}>{t('senderFilter.complexEditTitle')}</Label>
                          <div className="flex-1 space-y-2">
                            <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-xs text-amber-700 dark:text-amber-300">
                              {t('senderFilter.complexEditHint')}
                            </div>
                            <pre className="rounded-lg border bg-muted/40 p-3 text-xs font-mono overflow-x-auto max-h-48 overflow-y-auto whitespace-pre-wrap break-all">{complexRawCondition}</pre>
                          </div>
                        </div>
                      ) : (<>
                      {/* 发信人 */}
                      <div className="flex items-start gap-3">
                        <Label className={cn(labelCls, 'pt-2')}>
                          <span className="text-destructive">*</span> {t('senderFilter.senderType')}
                        </Label>
                        <div className="flex-1">
                          <div className="flex gap-2">
                            <Select
                              value={watchSenderType}
                              onValueChange={(v) => {
                                form.setValue('sender_config.type', v as SenderConfigType, { shouldDirty: true });
                                form.setValue('sender_config.value', '', { shouldDirty: true });
                              }}
                            >
                              <SelectTrigger className="w-28 shrink-0">
                                <SelectValue>{senderTypeLabel[watchSenderType]}</SelectValue>
                              </SelectTrigger>
                              <SelectContent alignItemWithTrigger={false}>
                                <SelectItem value="individual">{senderTypeLabel.individual}</SelectItem>
                                <SelectItem value="group">{senderTypeLabel.group}</SelectItem>
                                <SelectItem value="domain">{senderTypeLabel.domain}</SelectItem>
                              </SelectContent>
                            </Select>

                            {watchSenderType === 'group' ? (
                              <Select
                                value={watchSenderValue}
                                onValueChange={(value) => form.setValue('sender_config.value', value ?? '', { shouldDirty: true, shouldValidate: true })}
                              >
                                <SelectTrigger className="flex-1" aria-invalid={!!form.formState.errors.sender_config?.value}>
                                  <SelectValue placeholder={t('senderFilter.senderPlaceholder_group')} />
                                </SelectTrigger>
                                <SelectContent alignItemWithTrigger={false}>
                                  {groups.senderGroups.map((group) => (
                                    <SelectItem key={group.name} value={group.name}>
                                      {group.name}{group.memberCount != null ? ` (${group.memberCount})` : ''}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            ) : watchSenderType === 'domain' ? (
                              /* 支持自由输入任意合法外部域名，同时将租户接收域名作为快捷建议。 */
                              <DomainCombobox
                                value={watchSenderValue}
                                suggestions={tenantDomains}
                                placeholder={t('senderFilter.senderPlaceholder_domain')}
                                suggestionsLabel={t('senderFilter.domainSuggestions')}
                                hasError={!!form.formState.errors.sender_config?.value}
                                onChange={(v) => form.setValue('sender_config.value', v, { shouldDirty: true, shouldValidate: true })}
                              />
                            ) : (
                              <Input
                                className="flex-1"
                                placeholder={t('senderFilter.senderPlaceholder_individual')}
                                {...form.register('sender_config.value')}
                                aria-invalid={!!form.formState.errors.sender_config?.value}
                              />
                            )}
                          </div>
                          {form.formState.errors.sender_config?.value && (
                            <p className="text-xs text-destructive mt-1">{t(`senderFilter.errors.${form.formState.errors.sender_config.value.message}`)}</p>
                          )}
                        </div>
                      </div>

                      {/* 发信IP范围 */}
                      <div className="flex items-start gap-3">
                        <Label className={cn(labelCls, 'pt-2')}>{t('senderFilter.ipRange')}</Label>
                        <div className="flex-1">
                          <div className="flex gap-2">
                            <Select
                              value={watchIpType}
                              onValueChange={(v) => {
                                form.setValue('ip_range.type', v as IPRangeType, { shouldDirty: true });
                                form.setValue('ip_range.value', undefined, { shouldDirty: true });
                              }}
                            >
                              <SelectTrigger className="w-28 shrink-0">
                                <SelectValue>{ipTypeLabel[watchIpType]}</SelectValue>
                              </SelectTrigger>
                              <SelectContent alignItemWithTrigger={false}>
                                <SelectItem value="all">{ipTypeLabel.all}</SelectItem>
                                <SelectItem value="ipGroup">{ipTypeLabel.ipGroup}</SelectItem>
                                <SelectItem value="single">{ipTypeLabel.single}</SelectItem>
                                <SelectItem value="range">{ipTypeLabel.range}</SelectItem>
                              </SelectContent>
                            </Select>

                            {watchIpType === 'ipGroup' && (
                              <Select
                                value={form.watch('ip_range.value') ?? ''}
                                onValueChange={(value) => form.setValue('ip_range.value', value ?? '', { shouldDirty: true, shouldValidate: true })}
                              >
                                <SelectTrigger className="flex-1" aria-invalid={!!form.formState.errors.ip_range?.value}>
                                  <SelectValue placeholder={t('senderFilter.ipType_ipGroup')} />
                                </SelectTrigger>
                                <SelectContent alignItemWithTrigger={false}>
                                  {groups.ipGroups.map((group) => (
                                    <SelectItem key={group.name} value={group.name}>
                                      {group.name}{group.memberCount != null ? ` (${group.memberCount})` : ''}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            )}
                            {(watchIpType === 'single' || watchIpType === 'range') && (
                              <Input
                                className="flex-1"
                                placeholder={watchIpType === 'single' ? 'e.g. 192.168.1.1' : 'e.g. 192.168.1.0/24'}
                                {...form.register('ip_range.value')}
                                aria-invalid={!!form.formState.errors.ip_range?.value}
                              />
                            )}
                          </div>
                          {form.formState.errors.ip_range?.value && (
                            <p className="text-xs text-destructive mt-1">{t(`senderFilter.errors.${form.formState.errors.ip_range.value.message}`)}</p>
                          )}
                        </div>
                      </div>

                      </>)}

                      {/* 有效期至 */}
                      <div className="flex items-center gap-3">
                        <Label className={labelCls}>{t('senderFilter.expireAt')}</Label>
                        <div className="flex-1 flex items-center gap-2">
                          <Input
                            type="date"
                            {...form.register('valid_until')}
                            className="w-40"
                          />
                          <span className="text-xs text-muted-foreground">({t('senderFilter.expireAtHint')})</span>
                        </div>
                      </div>

                      {/* 优先级 */}
                      <div className="flex items-center gap-3">
                        <Label className={cn('flex items-center justify-end gap-1', labelCls)}>
                          {t('senderFilter.priority')}
                          <Tooltip>
                            <TooltipTrigger render={<HelpCircle className="h-3.5 w-3.5 text-muted-foreground" />} />
                            <TooltipContent>
                              <p>{t('senderFilter.priorityHelp')}</p>
                            </TooltipContent>
                          </Tooltip>
                        </Label>
                        <div className="flex-1 flex items-center gap-2">
                          <Input
                            type="number"
                            {...form.register('priority', { valueAsNumber: true })}
                            className="w-24"
                            min={priorityRange.min}
                            max={priorityRange.max}
                          />
                          <span className="text-xs text-muted-foreground">
                            {priorityRange.min}-{priorityRange.max}
                          </span>
                          {form.formState.errors.priority && (
                            <p className="text-xs text-destructive">
                              {t(`senderFilter.errors.${form.formState.errors.priority.message}`, {
                                min: priorityRange.min,
                                max: priorityRange.max,
                              })}
                            </p>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* 执行动作（复杂规则不可改动作，隐藏整卡） */}
                  {!isComplexEdit && (
                  <div className="rounded-lg border bg-muted/30 p-5">
                    <div className="flex items-center gap-2 mb-4">
                      <div className="h-5 w-1 rounded-full bg-destructive" />
                      <h3 className="font-medium">{t('senderFilter.sectionAction')}</h3>
                    </div>

                    <div className="space-y-4">
                      {/* 动作 */}
                      <div className="flex items-center gap-3">
                        <Label className={labelCls}>{t('senderFilter.action')}</Label>
                        <Select
                          value={watchAction}
                          onValueChange={(v) => form.setValue('action', v as SenderFilterAction, { shouldDirty: true })}
                        >
                          <SelectTrigger className="w-40">
                            <SelectValue>{actionLabel[watchAction]}</SelectValue>
                          </SelectTrigger>
                          <SelectContent alignItemWithTrigger={false}>
                            {watchListType === 'blacklist' ? (
                              <>
                                <SelectItem value="reject">{actionLabel.reject}</SelectItem>
                                <SelectItem value="quarantine">{actionLabel.quarantine}</SelectItem>
                                <SelectItem value="audit">{actionLabel.audit}</SelectItem>
                              </>
                            ) : (
                              <SelectItem value="accept">{actionLabel.accept}</SelectItem>
                            )}
                          </SelectContent>
                        </Select>
                      </div>

                      {watchListType === 'whitelist' && (
                        <div className="flex items-center gap-3">
                          <Label htmlFor="sender-filter-whitelist-mode" className={labelCls}>
                            {t('senderFilter.whitelistMode')}
                          </Label>
                          <div className="flex-1">
                            <Select
                              value={watchWhitelistMode ?? ''}
                              onValueChange={(value) => {
                                const mode = value as WhitelistMode;
                                form.setValue('whitelist_mode', mode, { shouldDirty: true, shouldValidate: true });
                                form.setValue('priority', getDefaultPriority('whitelist', mode), { shouldDirty: true });
                              }}
                            >
                              <SelectTrigger id="sender-filter-whitelist-mode" className="w-48" aria-invalid={!!form.formState.errors.whitelist_mode}>
                                <SelectValue>
                                  {watchWhitelistMode
                                    ? t(`senderFilter.whitelistMode_${watchWhitelistMode}`)
                                    : undefined}
                                </SelectValue>
                              </SelectTrigger>
                              <SelectContent alignItemWithTrigger={false}>
                                <SelectItem value="bypass_content">{t('senderFilter.whitelistMode_bypass_content')}</SelectItem>
                                <SelectItem value="direct_deliver">{t('senderFilter.whitelistMode_direct_deliver')}</SelectItem>
                              </SelectContent>
                            </Select>
                            {form.formState.errors.whitelist_mode && (
                              <p className="text-xs text-destructive mt-1">
                                {t(`senderFilter.errors.${form.formState.errors.whitelist_mode.message}`)}
                              </p>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>

                  )}

                  {/* 备注（位于执行动作卡片下方，独立呈现） */}
                  <div className="flex items-start gap-3">
                    <Label className={cn(labelCls, 'pt-2')}>{t('senderFilter.remark')}</Label>
                    <div className="flex-1">
                      <Textarea
                        {...form.register('description')}
                        className="min-h-[80px] resize-none"
                        maxLength={200}
                        placeholder={t('senderFilter.remarkPlaceholder')}
                      />
                      <p className="text-xs text-muted-foreground mt-1">{descLength}/200</p>
                    </div>
                  </div>
                </div>
              </TooltipProvider>
            </form>
          </div>

          {/* Right column: preview + help */}
          <div className="flex-1 overflow-y-auto bg-muted/40 p-6">
            <div className="space-y-6">
              {/* 复杂规则模式下隐藏效果预览/示例/模拟测试——它们只对简易
                  表单的 sender_config 有意义，对隐藏的条件字段展示会误导 */}
              {!isComplexEdit && (<>
              {/* 1. 当前配置效果 */}
              <div className="rounded-lg border bg-card p-5">
                <div className="flex items-center gap-2 mb-4">
                  <Zap className="h-4 w-4 text-primary" />
                  <h3 className="font-medium">{t('senderFilter.currentEffect')}</h3>
                </div>
                <div className="space-y-3 text-sm">
                  <div className="flex items-start gap-2">
                    <Shield className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
                    <div>
                      <span className="text-muted-foreground">{t('senderFilter.effectSenderLabel')}</span>
                      <Badge variant="secondary" className="mx-1.5 font-mono">
                        {watchSenderValue || t('senderFilter.effectSenderEmpty')}
                      </Badge>
                    </div>
                  </div>
                  <div className="flex items-start gap-2">
                    <Ban className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
                    <div>
                      <span className="text-muted-foreground">{t('senderFilter.effectActionLabel')}</span>
                      <span className="ml-1.5 font-medium">{actionLabel[watchAction]}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Clock className="h-4 w-4 text-muted-foreground shrink-0" />
                    <span className="text-muted-foreground">{t('senderFilter.effectExpireLabel')}:</span>
                    <span>{watchValidUntil || t('senderFilter.effectExpirePermanent')}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-muted-foreground">{t('senderFilter.effectPriorityLabel')}:</span>
                    <Badge variant="outline" className="font-mono">{watchPriority}</Badge>
                  </div>
                </div>
              </div>

              {/* 2. 查看配置示例 */}
              <Collapsible open={showExamples} onOpenChange={setShowExamples}>
                <CollapsibleTrigger
                  render={
                    <Button variant="ghost" className="w-full justify-between text-primary hover:text-primary">
                      <span className="flex items-center gap-2">
                        <Lightbulb className="h-4 w-4" />
                        {t('senderFilter.viewExamples')}
                      </span>
                      {showExamples ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                    </Button>
                  }
                />
                <CollapsibleContent className="mt-3 space-y-3">
                  <div className="rounded-lg border bg-card p-4">
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <div>
                        <h4 className="text-sm font-medium">{t('senderFilter.exampleBlockSpam')}</h4>
                        <p className="text-xs text-muted-foreground">{t('senderFilter.exampleBlockSpamDesc')}</p>
                      </div>
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 text-xs shrink-0"
                        type="button"
                        onClick={() => {
                          form.setValue('sender_config', { type: 'individual', value: 'spam@bad.com' }, { shouldDirty: true });
                          form.setValue('ip_range', { type: 'all' }, { shouldDirty: true });
                          form.setValue('list_type', 'blacklist', { shouldDirty: true });
                          form.setValue('action', 'reject', { shouldDirty: true });
                          form.setValue('priority', 500, { shouldDirty: true });
                          setShowExamples(false);
                        }}
                      >
                        {t('senderFilter.useExample')}
                      </Button>
                    </div>
                  </div>
                  <div className="rounded-lg border bg-card p-4">
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <div>
                        <h4 className="text-sm font-medium">{t('senderFilter.exampleQuarantineSuspicious')}</h4>
                        <p className="text-xs text-muted-foreground">{t('senderFilter.exampleQuarantineSuspiciousDesc')}</p>
                      </div>
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 text-xs shrink-0"
                        type="button"
                        onClick={() => {
                          form.setValue('sender_config', { type: 'domain', value: 'suspicious.test' }, { shouldDirty: true });
                          form.setValue('ip_range', { type: 'range', value: '192.168.1.0/24' }, { shouldDirty: true });
                          form.setValue('list_type', 'blacklist', { shouldDirty: true });
                          form.setValue('action', 'quarantine', { shouldDirty: true });
                          form.setValue('priority', 500, { shouldDirty: true });
                          setShowExamples(false);
                        }}
                      >
                        {t('senderFilter.useExample')}
                      </Button>
                    </div>
                  </div>
                </CollapsibleContent>
              </Collapsible>

              {/* 3. 模拟测试 */}
              <Collapsible open={showSimulation} onOpenChange={setShowSimulation}>
                <CollapsibleTrigger
                  render={
                    <Button variant="ghost" className="w-full justify-between text-primary hover:text-primary">
                      <span className="flex items-center gap-2">
                        <Play className="h-4 w-4" />
                        {t('senderFilter.simulationTest')}
                      </span>
                      {showSimulation ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                    </Button>
                  }
                />
                <CollapsibleContent className="mt-3">
                  <div className="rounded-lg border bg-card p-4 space-y-4">
                    <div>
                      <Label className="text-xs mb-1.5 block">{t('senderFilter.simEmailLabel')}</Label>
                      <Input
                        value={simEmail}
                        onChange={(e) => setSimEmail(e.target.value)}
                        placeholder={t('senderFilter.simEmailPlaceholder')}
                        className="h-8 text-sm"
                      />
                    </div>
                    <Button type="button" size="sm" className="w-full" onClick={runSimulation}>
                      {t('senderFilter.startTest')}
                    </Button>

                    {simMatch !== null && (
                      simMatch === 'group_notice' ? (
                        <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-xs text-amber-700 dark:text-amber-300">
                          {t('senderFilter.simGroupNotice')}
                        </div>
                      ) : (
                        <div className={cn(
                          'rounded-lg border p-3 text-sm',
                          simMatch
                            ? 'border-rose-500/40 bg-rose-500/10'
                            : 'border-emerald-500/40 bg-emerald-500/10',
                        )}>
                          <div className="flex items-center gap-2 mb-1">
                            {simMatch ? (
                              <>
                                <X className="h-4 w-4 text-rose-600 dark:text-rose-400" />
                                <span className="font-medium text-rose-700 dark:text-rose-300">{t('senderFilter.hitRule')}</span>
                              </>
                            ) : (
                              <>
                                <Check className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                                <span className="font-medium text-emerald-700 dark:text-emerald-300">{t('senderFilter.notHit')}</span>
                              </>
                            )}
                          </div>
                          <p className={cn(
                            'text-xs',
                            simMatch ? 'text-rose-600 dark:text-rose-400' : 'text-emerald-600 dark:text-emerald-400',
                          )}>
                            {simMatch ? t('senderFilter.simMatch') : t('senderFilter.simNoMatch')}
                          </p>
                        </div>
                      )
                    )}
                  </div>
                </CollapsibleContent>
              </Collapsible>

              </>)}

              {/* 4. 配置提示 */}
              <div className="rounded-lg border bg-card p-4">
                <h4 className="text-sm font-medium mb-3">{t('senderFilter.configHintsTitle')}</h4>
                <ul className="space-y-2 text-xs text-muted-foreground">
                  {['configHint1', 'configHint2', 'configHint3', 'configHint4'].map((k) => (
                    <li key={k} className="flex items-center gap-2">
                      <span className="h-1.5 w-1.5 rounded-full bg-primary shrink-0" />
                      {t(`senderFilter.${k}` as 'senderFilter.configHint1')}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        </div>

        <div className="flex justify-end gap-2 border-t px-6 py-4 flex-shrink-0">
          <Button type="button" variant="outline" onClick={() => handleOpenChange(false)}>
            {t('common.cancel')}
          </Button>
          <Button type="submit" form="sender-filter-form" disabled={isSubmitting}>
            {isSubmitting && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
            {t('common.save')}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
