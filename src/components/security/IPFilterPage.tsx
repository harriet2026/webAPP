'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { ColumnDef } from '@tanstack/react-table';
import {
  Plus,
  Pencil,
  Trash2,
  Loader2,
  Download,
  Upload,
  Search,
  HelpCircle,
  Zap,
  Shield,
  Info,
  Clock,
  Lightbulb,
  Play,
  Check,
  X,
  AlertTriangle,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { DataTable } from '@/components/shared/data-table';
import { ConfirmDialog } from '@/components/shared/confirm-dialog';
import {
  getIPFilterRules,
  deleteIPFilterRule,
  setIPFilterRuleStatus,
  exportIPFilterRules,
  getIPGroups,
} from '@/lib/api/ip-filter';
import {
  toGatewayPayload,
  fromGatewayView,
  hasWhitelistTag,
  BLACKLIST_DEMO_ACTIONS,
  WHITELIST_DEMO_ACTIONS,
  DEMO_ACTION_LABEL_KEY,
  DEMO_ACTION_TIP_KEY,
  DEMO_ACTION_BADGE_CLASS,
} from '@/lib/api/ip-filter-action-map';
import {
  calculateIpCount,
  formatIpCount,
  ipInRangeSimple,
  DEMO_ACTION_EFFECT_KEY,
  getConfigExamples,
} from '@/components/security/ip-filter-helpers';
import {
  IP_EXPRESSION_ERROR_CODES,
  MAX_IP_GROUPS,
  buildIPFilterRulePayload,
  ipConfigFieldsFromView,
  ipMatchesExpressionSimple,
  isValidIP,
  isValidIPv6,
  validateIPExpressionConfig,
} from '@/components/security/ip-filter-expression';
import type {
  IPFilterRuleView,
  IPFilterRulePayload,
  IPFilterListType,
  IPFilterIPConfigType,
  DemoAction,
} from '@/types/ip-filter';
import { useState, useCallback, useMemo } from 'react';
import { toast } from 'sonner';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Checkbox } from '@/components/ui/checkbox';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Collapsible, CollapsibleContent } from '@/components/ui/collapsible';
import { CollapsibleSectionTrigger } from '@/components/ui/collapsible-section-trigger';
import { cn } from '@/lib/utils';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useApiRequest } from '@/lib/api/client';
import { PageHeader, PageShell } from '@/components/shared/page-shell';
import { format } from 'date-fns';
import { useAuth } from '@/contexts/auth-context';
import { getRulePriorityRange, isPriorityInRange } from '@/components/security/advanced-filter-rules/priority-range';
import { ModuleMasterSwitch } from '@/components/security/ModuleMasterSwitch';
import { IPFilterImportDialog } from '@/components/security/IPFilterImportDialog';
import { useApiErrorMessage } from '@/lib/api/use-api-error-message';

const BLACKLIST_ACTION_SET = new Set<DemoAction>(BLACKLIST_DEMO_ACTIONS);
const WHITELIST_ACTION_SET = new Set<DemoAction>(WHITELIST_DEMO_ACTIONS);

import type { PriorityRange } from '@/components/security/advanced-filter-rules/priority-range';

export function createRuleSchema(range: PriorityRange) {
  return z
  .object({
    name: z.string().min(1, 'nameRequired'),
    description: z.string().max(200).optional(),
    list_type: z.enum(['blacklist', 'whitelist']),
    ip_config_type: z.enum(['single', 'range', 'expression']),
    ip_value: z.string().optional(),
    // 仅 expression 使用：全局 IP 组的数值规则 ID，≤20 个（与后端一致）。
    ip_groups: z.array(z.number()).max(MAX_IP_GROUPS, 'expressionTooManyGroups').optional(),
    demo_action: z.enum(['reject', 'quarantine', 'discard', 'audit', 'accept']),
    add_whitelist_tag: z.boolean(),
    priority: z.number().int().min(range.min, 'priorityOutOfRange').max(range.max, 'priorityOutOfRange'),
    is_active: z.boolean(),
    valid_until: z.string().optional(),
  })
  .superRefine((data, ctx) => {
    // 动作与名单类型一致
    if (data.list_type === 'blacklist' && !BLACKLIST_ACTION_SET.has(data.demo_action)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['demo_action'], message: 'blacklistActionInvalid' });
    }
    if (data.list_type === 'whitelist' && !WHITELIST_ACTION_SET.has(data.demo_action)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['demo_action'], message: 'whitelistActionInvalid' });
    }
    // IP 值校验
    if (data.ip_config_type === 'expression') {
      // 与后端同构：逐项解析 + 纯排除/空值联动组数量的安全边界。
      const code = validateIPExpressionConfig(data.ip_value ?? '', data.ip_groups?.length ?? 0);
      if (code) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['ip_value'], message: code });
      }
    } else {
      const ip = (data.ip_value ?? '').trim();
      if (!ip) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['ip_value'], message: 'ipAddressRequired' });
      } else if (data.ip_config_type === 'single') {
        if (!isValidIP(ip)) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['ip_value'], message: 'invalidIp' });
      } else {
        const [ipStr, prefixStr, extra] = ip.split('/');
        if (!ipStr || !prefixStr || extra !== undefined || !/^\d+$/.test(prefixStr) || !isValidIP(ipStr)) {
          ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['ip_value'], message: 'invalidCidr' });
        } else {
          const prefix = +prefixStr;
          const maxPrefix = isValidIPv6(ipStr) ? 128 : 32;
          if (prefix < 0 || prefix > maxPrefix) {
            ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['ip_value'], message: 'cidrPrefixMax' });
          }
        }
      }
    }
    if (data.valid_until && new Date(data.valid_until) < new Date()) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['valid_until'], message: 'validUntilBeforeNow' });
    }
  });
}

// Backward-compatible export for existing tests (tenant-admin range).
export const ruleSchema = createRuleSchema({ min: 100, max: 1000, defaultValue: 600 });

type RuleForm = z.infer<ReturnType<typeof createRuleSchema>>;

/**
 * Every i18n key `ruleSchema` can attach to the `ip_value` field (GT-12087).
 * The error is rendered via `t(`ipFilter.${message}`)`, so each of these must
 * exist under the `ipFilter` namespace in every locale — otherwise an illegal
 * IP/CIDR silently shows the generic "required" text (or a raw key) instead of
 * the format hint the requirement asks for. Kept in sync by
 * `ip-filter-validation-i18n.test.ts`. The expression codes come from
 * `ip-filter-expression.ts` (attached via variable, not literal — see
 * IP_EXPRESSION_ERROR_CODES there).
 */
export const ipValueErrorKeys = [
  'ipAddressRequired',
  'invalidIp',
  'invalidCidr',
  'cidrPrefixMax',
  ...IP_EXPRESSION_ERROR_CODES,
] as const;

interface SimResult {
  hit: boolean;
  reason: string;
}

// 动作在下拉/预览中的文字色（对齐 demo）
const ACTION_TEXT_CLASS: Record<DemoAction, string> = {
  quarantine: 'text-orange-600',
  audit: 'text-purple-600',
  reject: 'text-red-600',
  discard: 'text-red-700',
  accept: 'text-green-600',
};

// 「系统将执行」的效果色（demo：投递类绿、阻断/丢弃红、其余琥珀）
const ACTION_EFFECT_TEXT_CLASS: Record<DemoAction, string> = {
  accept: 'text-green-600 dark:text-green-400',
  reject: 'text-red-600 dark:text-red-400',
  discard: 'text-red-600 dark:text-red-400',
  quarantine: 'text-amber-600 dark:text-amber-400',
  audit: 'text-amber-600 dark:text-amber-400',
};

export function IPFilterPage({ embedded }: { embedded?: boolean } = {}) {
  const t = useTranslations();
  const apiErrorMessage = useApiErrorMessage();
  const queryClient = useQueryClient();
  const { apiRequest } = useApiRequest();
  const { isSystemAdmin } = useAuth();
  // 阶段1 IP 策略只有平台管理员能改：后端两条路由都挂在 adminOnly/RequireSystemAdmin
  // （internal/api/routes.go:443-444），策略流水线里该阶段对租户是 locked 的锁态、
  // 点不开抽屉。所以这里不按角色分档——能走到这段代码的只可能是平台管理员，
  // 按角色分会让人误以为租户也能编辑 IP 策略，与实际权限模型矛盾。
  const range = useMemo(() => getRulePriorityRange(true), []);
  const schema = useMemo(() => createRuleSchema(range), [range]);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingRule, setEditingRule] = useState<IPFilterRuleView | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<{ id: number; name: string } | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [search, setSearch] = useState('');
  const [listTypeTab, setListTypeTab] = useState<'blacklist' | 'whitelist'>('blacklist');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [policyEnabled, setPolicyEnabled] = useState(true);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);

  // 预览区（右栏）本地态
  const [showExamples, setShowExamples] = useState(false);
  const [showSimulator, setShowSimulator] = useState(false);
  const [simulatorIp, setSimulatorIp] = useState('');
  const [simResult, setSimResult] = useState<SimResult | null>(null);

  const form = useForm<RuleForm>({
    resolver: zodResolver(schema),
    defaultValues: {
      name: '',
      description: '',
      list_type: 'blacklist',
      ip_config_type: 'range',
      ip_value: '',
      ip_groups: [],
      demo_action: 'reject',
      add_whitelist_tag: false,
      priority: range.defaultValue,
      is_active: true,
      valid_until: '',
    },
  });

  const queryKey = ['ip-filter-rules', search, listTypeTab, page, pageSize];

  const { data: rulesData, isLoading } = useQuery({
    queryKey,
    queryFn: () =>
      getIPFilterRules(
        { q: search || undefined, page, page_size: pageSize, list_type: listTypeTab, sort: 'priority_desc' },
        apiRequest,
      ),
    enabled: embedded || isSystemAdmin,
  });

  const { data: ipGroupsData } = useQuery({
    queryKey: ['ip-groups'],
    queryFn: () => getIPGroups(apiRequest),
    enabled: embedded || isSystemAdmin,
  });
  const ipGroups = ipGroupsData?.items ?? [];

  const deleteMutation = useMutation({
    mutationFn: (id: number) => deleteIPFilterRule(id, apiRequest),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ip-filter-rules'] });
      toast.success(t('common.deleteSuccess'));
      setDeleteTarget(null);
    },
    onError: (error: Error) => toast.error(apiErrorMessage(error)),
  });

  const toggleMutation = useMutation({
    mutationFn: ({ id, isActive }: { id: number; isActive: boolean }) => setIPFilterRuleStatus(id, isActive, apiRequest),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ip-filter-rules'] });
      toast.success(t('common.updateSuccess'));
    },
    onError: (error: Error) => toast.error(apiErrorMessage(error)),
  });

  const resetPreview = useCallback(() => {
    setShowExamples(false);
    setShowSimulator(false);
    setSimulatorIp('');
    setSimResult(null);
  }, []);

  const handleOpenDialog = useCallback(
    (rule?: IPFilterRuleView) => {
      if (rule) {
        setEditingRule(rule);
        form.reset({
          name: rule.name,
          description: rule.description || '',
          list_type: rule.list_type as IPFilterListType,
          // 编辑回填：ip_config_type / ip_value / ip_groups 三字段来自行数据
          ...ipConfigFieldsFromView(rule),
          demo_action: fromGatewayView(rule.action, rule.add_headers, rule.list_type as IPFilterListType),
          add_whitelist_tag: hasWhitelistTag(rule.add_headers),
          priority: rule.priority,
          is_active: rule.is_active,
          valid_until: rule.valid_until ? rule.valid_until.slice(0, 10) : '',
        });
      } else {
        setEditingRule(null);
        form.reset({
          name: '',
          description: '',
          list_type: listTypeTab,
          ip_config_type: 'range',
          ip_value: '',
          ip_groups: [],
          demo_action: listTypeTab === 'whitelist' ? 'accept' : 'reject',
          add_whitelist_tag: false,
          priority: Math.min(Math.max((rulesData?.items?.[0]?.priority ?? (range.defaultValue - 1)) + 1, range.min), range.max),
          is_active: true,
          valid_until: '',
        });
      }
      resetPreview();
      setDialogOpen(true);
    },
    [form, listTypeTab, rulesData?.items, resetPreview, range],
  );

  const onSubmit = form.handleSubmit(async (data) => {
    setIsSubmitting(true);
    try {
      // expression 携带 ip_groups；single/range 不带（构造逻辑抽为纯函数便于测试）
      const payload: IPFilterRulePayload = buildIPFilterRulePayload(
        data,
        toGatewayPayload(data.demo_action, data.add_whitelist_tag),
      );
      if (editingRule) {
        await apiRequest(`/ip-filter/rules/${editingRule.id}`, { method: 'PUT', body: payload });
      } else {
        await apiRequest('/ip-filter/rules', { method: 'POST', body: payload });
      }
      queryClient.invalidateQueries({ queryKey: ['ip-filter-rules'] });
      toast.success(t(editingRule ? 'common.updateSuccess' : 'common.createSuccess'));
      setDialogOpen(false);
    } catch {
      toast.error(t('common.error'));
    } finally {
      setIsSubmitting(false);
    }
  }, (errors) => {
    // Backstop so Save never silently no-ops: the demo_action error
    // (blacklist/whitelistActionInvalid) has no inline render site. Follow this
    // page's convention of prefixing the ipFilter namespace onto bare keys.
    const first = Object.values(errors)[0] as { message?: string } | undefined;
    const raw = first?.message;
    if (!raw) { toast.error(t('common.error')); return; }
    toast.error(raw.includes('.') ? t(raw as never) : t(`ipFilter.${raw}` as never));
  });

  const handleExport = async () => {
    try {
      const result = await exportIPFilterRules(listTypeTab, apiRequest);
      const blob = new Blob([JSON.stringify(result, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `ip-filter-rules-${listTypeTab}-${format(new Date(), 'yyyy-MM-dd')}.json`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success(t('common.exportSuccess'));
    } catch {
      toast.error(t('common.error'));
    }
  };

  // GT-12137：批量导入改走原型要求的弹窗（文本粘贴 + CSV + 预览 + 去重），
  // 不再是裸 JSON 文件导入。弹窗需要「当前名单的全量既有规则」做既有重复判定，
  // 而分页 query 只含当前页，故单独拉一份全量（仅取 ip_value / id / priority）。
  const [importOpen, setImportOpen] = useState(false);
  const { data: allRulesForImport } = useQuery({
    queryKey: ['ip-filter-rules-all', listTypeTab],
    enabled: importOpen,
    queryFn: () =>
      getIPFilterRules(
        { list_type: listTypeTab, page: 1, page_size: 1000, sort: 'priority_desc' },
        apiRequest,
      ),
  });

  // ===== 表格列（demo 5 列） =====
  const columns: ColumnDef<IPFilterRuleView>[] = [
    {
      id: 'ipAddress',
      header: t('ipFilter.ipAddress'),
      cell: ({ row }) => {
        const r = row.original;
        if (r.ip_config_type === 'expression') {
          const groupCount = r.ip_groups?.length ?? 0;
          return (
            <span className="flex items-center gap-1.5 font-mono text-xs">
              {/* 表达式截断显示，title 悬停可见全文 */}
              <span className="truncate max-w-[260px] inline-block align-bottom" title={r.ip_value}>
                {r.ip_value || '—'}
              </span>
              {groupCount > 0 && (
                <Badge variant="outline" className="text-xs shrink-0">
                  {t('ipFilter.groupCountBadge', { count: groupCount })}
                </Badge>
              )}
            </span>
          );
        }
        return <span className="font-mono text-xs">{r.ip_value}</span>;
      },
    },
    {
      id: 'action',
      header: t('common.actions'),
      cell: ({ row }) => {
        const demoAction = fromGatewayView(row.original.action, row.original.add_headers, row.original.list_type);
        const tagged = hasWhitelistTag(row.original.add_headers);
        return (
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger
                render={
                  <span className="inline-flex items-center gap-1">
                    <Badge className={DEMO_ACTION_BADGE_CLASS[demoAction]}>{t(DEMO_ACTION_LABEL_KEY[demoAction])}</Badge>
                    {tagged && <Badge variant="outline">{t('ipFilter.actionTagDeliver')}</Badge>}
                  </span>
                }
              />
              <TooltipContent side="top" className="max-w-[260px]">
                <p className="text-sm">{t(DEMO_ACTION_TIP_KEY[demoAction])}</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        );
      },
    },
    {
      id: 'status',
      header: t('common.status'),
      cell: ({ row }) => {
        if (row.original.is_expired) {
          return <Badge variant="outline" className="text-destructive">{t('ipFrequency.expired')}</Badge>;
        }
        return (
          <div className="flex justify-center">
            <Switch
              checked={row.original.is_active}
              onCheckedChange={(isActive) => toggleMutation.mutate({ id: row.original.id, isActive })}
              aria-label={row.original.is_active ? t('ipFrequency.deactivate') : t('ipFrequency.activate')}
            />
          </div>
        );
      },
      size: 80,
    },
    {
      id: 'updatedAt',
      header: t('ipFilter.updatedAt'),
      cell: ({ row }) => (
        <span className="text-xs text-muted-foreground">
          {format(new Date(row.original.updated_at), 'yyyy-MM-dd HH:mm')}
        </span>
      ),
      size: 160,
    },
    {
      id: 'actions',
      header: t('common.actions'),
      cell: ({ row }) => (
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => handleOpenDialog(row.original)}>
            <Pencil className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={() => setDeleteTarget({ id: row.original.id, name: row.original.name })}
          >
            <Trash2 className="h-4 w-4 text-destructive" />
          </Button>
        </div>
      ),
      size: 100,
    },
  ];

  // ===== 表单/预览派生值 =====
  const watchAction = form.watch('demo_action');
  const watchWhitelistTag = form.watch('add_whitelist_tag');
  const watchIpConfigType = form.watch('ip_config_type');
  const watchIpValue = form.watch('ip_value') ?? '';
  const watchIpGroups = form.watch('ip_groups') ?? [];
  const watchExpire = form.watch('valid_until') ?? '';
  const watchPriority = form.watch('priority');
  const ipCount = watchIpConfigType === 'expression' ? 0 : calculateIpCount(watchIpValue);
  const configExamples = getConfigExamples(listTypeTab);
  const availableActions = listTypeTab === 'blacklist' ? BLACKLIST_DEMO_ACTIONS : WHITELIST_DEMO_ACTIONS;

  const runSimulation = () => {
    const actionLabel = t(DEMO_ACTION_LABEL_KEY[watchAction]);
    if (!watchIpValue || !simulatorIp) {
      setSimResult({ hit: false, reason: t('ipFilter.simulatorNeedIp') });
      return;
    }
    // expression 用内联项简化命中（组成员前端不可知，不参与模拟）；
    // single/range 沿用 demo 的简化匹配。
    const hit =
      watchIpConfigType === 'expression'
        ? ipMatchesExpressionSimple(simulatorIp, watchIpValue)
        : ipInRangeSimple(simulatorIp, watchIpValue);
    if (hit) {
      setSimResult({
        hit: true,
        reason: t('ipFilter.simulatorHitReason', { ip: simulatorIp, rule: watchIpValue, action: actionLabel }),
      });
    } else {
      setSimResult({ hit: false, reason: t('ipFilter.simulatorMissReason', { ip: simulatorIp, rule: watchIpValue }) });
    }
  };

  const applyExample = (example: (typeof configExamples)[number]) => {
    form.setValue('ip_config_type', 'range');
    form.setValue('ip_value', example.ip);
    form.setValue('demo_action', example.action);
    form.setValue('add_whitelist_tag', !!example.addWhitelistTag);
    form.setValue('name', t(example.remarkKey));
    setShowExamples(false);
  };

  if (!embedded && !isSystemAdmin) {
    return (
      <PageShell>
        <PageHeader title={t('ipFilter.title')} />
        <div className="flex items-center justify-center py-20 text-muted-foreground">{t('common.notAuthorized')}</div>
      </PageShell>
    );
  }

  const content = (
    <>
      <div className="space-y-4">
        {!embedded ? (
          <div className="flex items-center justify-between pb-4 border-b">
            <h2 className="text-lg font-semibold">{t('ipFilter.title')}</h2>
            <div className="flex items-center gap-2">
              <span className={cn('text-sm', policyEnabled ? 'text-primary' : 'text-gray-500')}>
                {policyEnabled ? t('ipFilter.enabled') : t('ipFilter.disabled')}
              </span>
              <Switch
                checked={policyEnabled}
                onCheckedChange={(checked) => {
                  setPolicyEnabled(checked);
                  setHasUnsavedChanges(true);
                }}
              />
            </div>
          </div>
        ) : null}

        <Tabs
          value={listTypeTab}
          onValueChange={(v) => {
            setListTypeTab(v as 'blacklist' | 'whitelist');
            setPage(1);
          }}
        >
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <TabsList>
              <TabsTrigger value="blacklist">{t('ipFilter.blacklistRules')}</TabsTrigger>
              <TabsTrigger value="whitelist">{t('ipFilter.whitelistRules')}</TabsTrigger>
            </TabsList>
            <div className="flex items-center gap-2 flex-wrap">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
                <Input
                  placeholder={`${t('ipFilter.ipAddress')}...`}
                  value={search}
                  onChange={(e) => {
                    setSearch(e.target.value);
                    setPage(1);
                  }}
                  className="pl-9 w-64"
                />
              </div>
              <Button size="sm" data-testid="ip-filter-create" onClick={() => handleOpenDialog()}>
                <Plus className="h-4 w-4 mr-1" />
                {t('ipFilter.createRule')}
              </Button>
              <Button variant="outline" size="sm" onClick={() => setImportOpen(true)}>
                <Upload className="h-4 w-4 mr-1" />
                {t('ipFilter.import')}
              </Button>
              <Button variant="outline" size="sm" onClick={handleExport}>
                <Download className="h-4 w-4 mr-1" />
                {t('ipFilter.export')}
              </Button>
            </div>
          </div>
        </Tabs>

        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin" />
          </div>
        ) : (
          <DataTable
            columns={columns}
            data={rulesData?.items || []}
            pageCount={Math.max(1, Math.ceil((rulesData?.total ?? 0) / pageSize))}
            pageIndex={page - 1}
            onPageChange={(newPage: number) => setPage(newPage + 1)}
            pageSize={pageSize}
            onPageSizeChange={(newPageSize: number) => {
              setPageSize(newPageSize);
              setPage(1);
            }}
          />
        )}

        <div className="flex items-center justify-start pt-3 border-t">
          {hasUnsavedChanges ? (
            <div className="flex items-center gap-2 text-amber-600 dark:text-amber-400">
              <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
              <span className="text-sm">{t('ipFilter.unsavedChanges')}</span>
            </div>
          ) : null}
        </div>
      </div>

      {/* 新建/编辑 Sheet —— 920px 双栏 */}
      <Sheet open={dialogOpen} onOpenChange={setDialogOpen}>
        <SheetContent
          side="right"
          className="data-[side=right]:w-[920px] data-[side=right]:sm:max-w-[920px] p-0 flex flex-col"
          showCloseButton
        >
          <SheetHeader className="px-6 py-4 border-b flex-shrink-0">
            <div className="flex items-center justify-between">
              <div>
                <SheetTitle className="text-lg font-semibold">
                  {editingRule
                    ? t(listTypeTab === 'blacklist' ? 'ipFilter.editBlacklistRule' : 'ipFilter.editWhitelistRule')
                    : t(listTypeTab === 'blacklist' ? 'ipFilter.addBlacklistRule' : 'ipFilter.addWhitelistRule')}
                </SheetTitle>
                <p className="text-sm text-muted-foreground mt-1">
                  {t(listTypeTab === 'blacklist' ? 'ipFilter.blacklistRuleDesc' : 'ipFilter.whitelistRuleDesc')}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" onClick={() => setDialogOpen(false)}>
                  {t('common.cancel')}
                </Button>
                <Button size="sm" data-testid="ip-filter-save" disabled={isSubmitting} onClick={onSubmit}>
                  {isSubmitting && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                  {t('ipFilter.saveAndEnable')}
                </Button>
              </div>
            </div>
          </SheetHeader>

          <div className="flex flex-1 overflow-hidden">
            {/* 左栏：表单 */}
            <form onSubmit={onSubmit} className="w-[560px] flex-shrink-0 overflow-y-auto p-6">
              <TooltipProvider>
                <div className="space-y-6">
                  {/* 基础设置 */}
                  <div className="bg-muted/50 rounded-lg p-5">
                    <div className="flex items-center gap-2 mb-4">
                      <div className="h-5 w-1 bg-blue-500 rounded-full" />
                      <h3 className="font-medium">{t('ipFilter.basicSettings')}</h3>
                    </div>
                    <div className="space-y-4">
                      {/* 规则名称 */}
                      <div className="flex items-start gap-3">
                        <Label className="min-w-[100px] w-[100px] shrink-0 text-right flex items-center justify-end gap-1 pt-2">
                          <span className="text-red-500">*</span> {t('ipFilter.ruleName')}
                          <Tooltip>
                            <TooltipTrigger render={<HelpCircle className="h-3.5 w-3.5 text-muted-foreground" />} />
                            <TooltipContent className="max-w-[300px]">
                              <p>{t('ipFilter.ruleNameTip')}</p>
                            </TooltipContent>
                          </Tooltip>
                        </Label>
                        <div className="flex-1">
                          <Input
                            data-testid="ip-filter-name"
                            placeholder={t('ipFilter.ruleNamePlaceholder')}
                            {...form.register('name')}
                            className={cn(form.formState.errors.name && 'border-red-500')}
                          />
                          {form.formState.errors.name && (
                            <p className="text-xs text-red-500 mt-1">{t('ipFilter.ruleNameRequired')}</p>
                          )}
                        </div>
                      </div>

                      {/* IP地址/段 */}
                      <div className="flex items-start gap-3">
                        <Label className="min-w-[100px] w-[100px] shrink-0 text-right flex items-center justify-end gap-1 pt-2">
                          <span className="text-red-500">*</span> {t('ipFilter.ipAddress')}
                          <Tooltip>
                            <TooltipTrigger render={<HelpCircle className="h-3.5 w-3.5 text-muted-foreground" />} />
                            <TooltipContent className="max-w-[300px]">
                              <p>{t('ipFilter.ipAddressTip')}</p>
                            </TooltipContent>
                          </Tooltip>
                        </Label>
                        <div className="flex-1">
                          <div className="flex gap-2">
                            <Select
                              value={watchIpConfigType}
                              onValueChange={(v) => {
                                if (!v) return;
                                form.setValue('ip_config_type', v as IPFilterIPConfigType);
                                // 组引用只属于 expression：切走时清空，避免残留提交被后端 400
                                if (v !== 'expression') form.setValue('ip_groups', []);
                              }}
                            >
                              <SelectTrigger className="w-28" data-testid="ip-filter-ip-config-type">
                                <SelectValue>
                                  {{
                                    single: t('ipFilter.ipConfigTypeSingle'),
                                    range: t('ipFilter.ipConfigTypeRange'),
                                    expression: t('ipFilter.ipConfigTypeExpression'),
                                  }[watchIpConfigType]}
                                </SelectValue>
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="single" data-testid="ip-filter-ip-config-type-option-single">{t('ipFilter.ipConfigTypeSingle')}</SelectItem>
                                <SelectItem value="range" data-testid="ip-filter-ip-config-type-option-range">{t('ipFilter.ipConfigTypeRange')}</SelectItem>
                                <SelectItem value="expression" data-testid="ip-filter-ip-config-type-option-expression">{t('ipFilter.ipConfigTypeExpression')}</SelectItem>
                              </SelectContent>
                            </Select>

                            {watchIpConfigType === 'expression' ? (
                              <Textarea
                                placeholder={t('ipFilter.expressionPlaceholder')}
                                {...form.register('ip_value')}
                                className={cn(
                                  'flex-1 min-h-[72px] font-mono text-xs',
                                  form.formState.errors.ip_value && 'border-red-500',
                                )}
                              />
                            ) : (
                              <Input
                                data-testid="ip-filter-ip-value"
                                placeholder={watchIpConfigType === 'single' ? '10.0.0.1' : '192.168.1.0/24'}
                                {...form.register('ip_value')}
                                className={cn('flex-1', form.formState.errors.ip_value && 'border-red-500')}
                              />
                            )}
                          </div>
                          {form.formState.errors.ip_value && (
                            <p className="text-xs text-red-500 mt-1">
                              {t(`ipFilter.${form.formState.errors.ip_value.message}`)}
                            </p>
                          )}
                          <p className="text-xs text-muted-foreground mt-1">
                            {watchIpConfigType === 'single'
                              ? t('ipFilter.singleIpHint')
                              : watchIpConfigType === 'range'
                                ? t('ipFilter.ipFormatHint')
                                : t('ipFilter.expressionHelp')}
                          </p>

                          {/* 表达式类型：IP 组多选（值 = 组的数值规则 ID） */}
                          {watchIpConfigType === 'expression' && (
                            <div className="mt-3 rounded-md border p-3">
                              <p className="text-xs font-medium mb-2">
                                {t('ipFilter.ipGroupsLabel')}
                                <span className="ml-1 text-muted-foreground font-normal">
                                  ({watchIpGroups.length}/{MAX_IP_GROUPS})
                                </span>
                              </p>
                              {ipGroups.length === 0 ? (
                                <p className="text-xs text-muted-foreground">{t('ipFilter.noIpGroups')}</p>
                              ) : (
                                <div className="max-h-40 overflow-y-auto space-y-1.5">
                                  {ipGroups.map((group) => {
                                    const checked = watchIpGroups.includes(group.rule_id);
                                    return (
                                      <label
                                        key={group.rule_id}
                                        className="flex items-center gap-2 text-sm cursor-pointer"
                                      >
                                        <Checkbox
                                          checked={checked}
                                          onCheckedChange={(next) => {
                                            const current = form.getValues('ip_groups') ?? [];
                                            form.setValue(
                                              'ip_groups',
                                              next
                                                ? [...current, group.rule_id]
                                                : current.filter((id) => id !== group.rule_id),
                                              { shouldValidate: true },
                                            );
                                          }}
                                        />
                                        <span>{group.label}</span>
                                      </label>
                                    );
                                  })}
                                </div>
                              )}
                              {form.formState.errors.ip_groups && (
                                <p className="text-xs text-red-500 mt-1">
                                  {t(`ipFilter.${form.formState.errors.ip_groups.message}`)}
                                </p>
                              )}
                            </div>
                          )}
                        </div>
                      </div>

                      {/* 有效期至 */}
                      <div className="flex items-center gap-3">
                        <Label className="min-w-[100px] w-[100px] shrink-0 text-right flex items-center justify-end gap-1">
                          {t('ipFilter.expireAt')}
                          <Tooltip>
                            <TooltipTrigger render={<HelpCircle className="h-3.5 w-3.5 text-muted-foreground" />} />
                            <TooltipContent className="max-w-[300px]">
                              <p>{t('ipFilter.expireAtTip')}</p>
                            </TooltipContent>
                          </Tooltip>
                        </Label>
                        <div className="flex-1 flex items-center gap-2">
                          <Input type="date" {...form.register('valid_until')} className="w-40" />
                          <span className="text-xs text-muted-foreground">({t('ipFilter.expireAtHint')})</span>
                        </div>
                      </div>
                      {form.formState.errors.valid_until && (
                        <div className="flex gap-3">
                          <div className="min-w-[100px] w-[100px] shrink-0" />
                          <p className="text-xs text-red-500">{t(`ipFilter.${form.formState.errors.valid_until.message}`)}</p>
                        </div>
                      )}

                      {/* 优先级 */}
                      <div className="flex items-center gap-3">
                        <Label className="min-w-[100px] w-[100px] shrink-0 text-right flex items-center justify-end gap-1">
                          {t('ipFilter.priority')}
                          <Tooltip>
                            <TooltipTrigger render={<HelpCircle className="h-3.5 w-3.5 text-muted-foreground" />} />
                            <TooltipContent className="max-w-[300px]">
                              <p>{t('ipFilter.priorityTip', { min: range.min, max: range.max })}</p>
                            </TooltipContent>
                          </Tooltip>
                        </Label>
                        <div className="flex-1 flex items-center gap-2">
                          <Input
                            type="number"
                            {...form.register('priority', { valueAsNumber: true })}
                            className="w-24"
                            min={range.min}
                            max={range.max}
                          />
                          <span className="text-xs text-muted-foreground">{t('ipFilter.priorityHint', { min: range.min, max: range.max })}</span>
                        </div>
                      </div>
                      {form.formState.errors.priority && (
                        <div className="flex gap-3">
                          <div className="min-w-[100px] w-[100px] shrink-0" />
                          <p className="text-xs text-red-500">{t('ipFilter.priorityOutOfRange', { min: range.min, max: range.max })}</p>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* 执行动作 */}
                  <div className="bg-muted/50 rounded-lg p-5">
                    <div className="flex items-center gap-2 mb-4">
                      <div
                        className={cn('h-5 w-1 rounded-full', listTypeTab === 'blacklist' ? 'bg-red-500' : 'bg-green-500')}
                      />
                      <h3 className="font-medium">{t('ipFilter.executeAction')}</h3>
                    </div>
                    <div className="space-y-2">
                      <Label className="text-sm text-muted-foreground flex items-center gap-1">
                        <span className="text-red-500">*</span> {t('ipFilter.executeAction')}
                        <Tooltip>
                          <TooltipTrigger render={<HelpCircle className="h-3.5 w-3.5 text-muted-foreground" />} />
                          <TooltipContent className="max-w-[300px]">
                            <p>
                              {t(
                                listTypeTab === 'blacklist'
                                  ? 'ipFilter.executeActionBlacklistTip'
                                  : 'ipFilter.executeActionWhitelistTip',
                              )}
                            </p>
                          </TooltipContent>
                        </Tooltip>
                      </Label>
                      <Select value={watchAction} onValueChange={(v) => v && form.setValue('demo_action', v as DemoAction)}>
                        <SelectTrigger className="w-full" data-testid="ip-filter-action">
                          <SelectValue>
                            <span className={ACTION_TEXT_CLASS[watchAction]}>{t(DEMO_ACTION_LABEL_KEY[watchAction])}</span>
                          </SelectValue>
                        </SelectTrigger>
                        <SelectContent>
                          {availableActions.map((a) => (
                            <SelectItem key={a} value={a} data-testid={`ip-filter-action-option-${a}`}>
                              <span className={ACTION_TEXT_CLASS[a]}>{t(DEMO_ACTION_LABEL_KEY[a])}</span>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      {watchAction === 'discard' && (
                        <div className="flex items-start gap-2 mt-2 p-3 bg-amber-50 dark:bg-amber-950/30 rounded-lg border border-amber-200 dark:border-amber-800">
                          <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5" />
                          <p className="text-amber-700 dark:text-amber-300 text-sm">{t('ipFilter.effectDropWarning')}</p>
                        </div>
                      )}
                      {listTypeTab === 'whitelist' && (
                        <label className="mt-3 flex items-center gap-2 text-sm">
                          <Checkbox
                            checked={watchWhitelistTag}
                            onCheckedChange={(checked) => form.setValue('add_whitelist_tag', checked === true)}
                          />
                          {t('ipFilter.actionTagDeliver')}
                        </label>
                      )}
                    </div>
                  </div>

                  {/* 备注说明 */}
                  <div className="bg-muted/50 rounded-lg p-5">
                    <div className="flex items-center gap-2 mb-4">
                      <div className="h-5 w-1 bg-gray-400 rounded-full" />
                      <h3 className="font-medium">{t('ipFilter.remarkTitle')}</h3>
                    </div>
                    <Textarea
                      placeholder={t('ipFilter.remarkPlaceholder')}
                      {...form.register('description')}
                      className="min-h-[80px]"
                      maxLength={200}
                    />
                  </div>
                </div>
              </TooltipProvider>
            </form>

            {/* 右栏：预览与帮助 */}
            <div className="flex-1 overflow-y-auto bg-muted/30 p-6">
              <div className="space-y-6">
                {/* 当前配置效果 */}
                <div className="bg-background rounded-lg p-5 border">
                  <div className="flex items-center gap-2 mb-4">
                    <Zap className="h-4 w-4 text-blue-500" />
                    <h3 className="font-medium">{t('ipFilter.currentConfigEffect')}</h3>
                  </div>
                  <div className="space-y-3 text-sm">
                    <div className="flex items-start gap-2">
                      <Shield className="h-4 w-4 text-muted-foreground mt-0.5" />
                      <div>
                        <span className="text-muted-foreground">{t('ipFilter.previewWhenIp')}</span>
                        <Badge variant="secondary" className="mx-1.5 font-mono max-w-[220px] truncate align-bottom">
                          {watchIpValue || t('ipFilter.notFilled')}
                        </Badge>
                        {watchIpConfigType === 'expression' && watchIpGroups.length > 0 && (
                          <Badge variant="outline" className="text-xs">
                            {t('ipFilter.groupCountBadge', { count: watchIpGroups.length })}
                          </Badge>
                        )}
                        {watchIpConfigType !== 'expression' && ipCount > 1 && (
                          <span className="text-xs text-muted-foreground">
                            ({t('ipFilter.affectsAbout')} {formatIpCount(ipCount)} {t('ipFilter.ipAddresses')})
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="flex items-start gap-2">
                      <Info className="h-4 w-4 text-muted-foreground mt-0.5" />
                      <div>
                        <span className="text-muted-foreground">{t('ipFilter.willExecute')}</span>
                        <span className={cn('ml-1.5 font-medium', ACTION_EFFECT_TEXT_CLASS[watchAction])}>
                          [{t(DEMO_ACTION_LABEL_KEY[watchAction])}]
                        </span>
                      </div>
                    </div>
                    <div className="flex items-start gap-2">
                      <Clock className="h-4 w-4 text-muted-foreground mt-0.5" />
                      <div>
                        <span className="text-muted-foreground">{t('ipFilter.effectDescription')}</span>
                        <span className="ml-1.5 text-foreground">{t(DEMO_ACTION_EFFECT_KEY[watchAction])}</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-muted-foreground">{t('ipFilter.validityPeriod')}</span>
                      <span>{watchExpire || t('ipFilter.previewPermanent')}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-muted-foreground">{t('ipFilter.priorityLabel')}</span>
                      <Badge variant="outline" className="font-mono">
                        {watchPriority}
                      </Badge>
                      <span className="text-xs text-muted-foreground">({t('ipFilter.higherIsPriority')})</span>
                    </div>
                  </div>
                </div>

                {/* 配置示例 */}
                <Collapsible open={showExamples} onOpenChange={setShowExamples}>
                  <CollapsibleSectionTrigger>
                    <Lightbulb className="h-4 w-4" />
                    {t('ipFilter.viewConfigExamples')}
                  </CollapsibleSectionTrigger>
                  <CollapsibleContent className="mt-3 space-y-3">
                    {configExamples.map((example) => (
                      <div key={example.id} className="bg-background rounded-lg p-4 border">
                        <div className="flex items-start justify-between mb-2">
                          <div>
                            <h4 className="font-medium text-sm">{t(example.nameKey)}</h4>
                            <p className="text-xs text-muted-foreground">{t(example.descKey)}</p>
                          </div>
                          <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => applyExample(example)}>
                            {t('ipFilter.useThisExample')}
                          </Button>
                        </div>
                        <p className="text-xs text-muted-foreground bg-muted/50 rounded p-2">{t(example.effectKey)}</p>
                      </div>
                    ))}
                  </CollapsibleContent>
                </Collapsible>

                {/* 模拟测试 */}
                <Collapsible open={showSimulator} onOpenChange={setShowSimulator}>
                  <CollapsibleSectionTrigger>
                    <Play className="h-4 w-4" />
                    {t('ipFilter.simulationTest')}
                  </CollapsibleSectionTrigger>
                  <CollapsibleContent className="mt-3">
                    <div className="bg-background rounded-lg p-4 border space-y-4">
                      <div>
                        <Label className="text-xs mb-1.5 block">{t('ipFilter.simulatorIpLabel')}</Label>
                        <Input
                          value={simulatorIp}
                          onChange={(e) => setSimulatorIp(e.target.value)}
                          placeholder="192.168.1.100"
                          className="h-8 text-sm"
                        />
                      </div>
                      <Button
                        size="sm"
                        className="w-full"
                        onClick={runSimulation}
                        disabled={!watchIpValue}
                      >
                        {t('ipFilter.startTest')}
                      </Button>
                      {simResult && (
                        <div
                          className={cn(
                            'rounded-lg p-3 text-sm border',
                            simResult.hit
                              ? 'bg-red-50 dark:bg-red-950/30 border-red-200 dark:border-red-800'
                              : 'bg-green-50 dark:bg-green-950/30 border-green-200 dark:border-green-800',
                          )}
                        >
                          <div className="flex items-center gap-2 mb-1">
                            {simResult.hit ? (
                              <>
                                <X className="h-4 w-4 text-red-600" />
                                <span className="font-medium text-red-700 dark:text-red-400">{t('ipFilter.ruleHit')}</span>
                              </>
                            ) : (
                              <>
                                <Check className="h-4 w-4 text-green-600" />
                                <span className="font-medium text-green-700 dark:text-green-400">
                                  {t('ipFilter.ruleMiss')}
                                </span>
                              </>
                            )}
                          </div>
                          <p
                            className={cn(
                              'text-xs',
                              simResult.hit
                                ? 'text-red-600 dark:text-red-400'
                                : 'text-green-600 dark:text-green-400',
                            )}
                          >
                            {simResult.reason}
                          </p>
                        </div>
                      )}
                    </div>
                  </CollapsibleContent>
                </Collapsible>

                {/* 配置提示 */}
                <div className="bg-background rounded-lg p-4 border">
                  <h4 className="font-medium text-sm mb-3">{t('ipFilter.configTips')}</h4>
                  <ul className="space-y-2 text-xs text-muted-foreground">
                    {[
                      'ipFilter.tipPriorityLarger',
                      'ipFilter.tipEmptyExpire',
                      'ipFilter.tipCidrFormat',
                      listTypeTab === 'blacklist' ? 'ipFilter.tipBlacklistFirstMatch' : 'ipFilter.tipWhitelistFirstMatch',
                    ].map((k) => (
                      <li key={k} className="flex items-center gap-2">
                        <span className="w-1.5 h-1.5 rounded-full bg-blue-500" />
                        {t(k)}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>
          </div>
        </SheetContent>
      </Sheet>

      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null);
        }}
        title={t('ipFilter.deleteRule')}
        description={t('ipFrequency.deleteConfirm', { name: deleteTarget?.name ?? '' })}
        onConfirm={() => {
          if (deleteTarget) deleteMutation.mutate(deleteTarget.id);
        }}
        variant="destructive"
      />

      <IPFilterImportDialog
        open={importOpen}
        onOpenChange={setImportOpen}
        listType={listTypeTab}
        existingRules={allRulesForImport?.items ?? []}
        apiRequest={apiRequest}
        onImported={() => {
          queryClient.invalidateQueries({ queryKey: ['ip-filter-rules'] });
          queryClient.invalidateQueries({ queryKey: ['ip-filter-rules-all'] });
        }}
      />
    </>
  );

  if (embedded) {
    return <ModuleMasterSwitch page="ip_filter">{content}</ModuleMasterSwitch>;
  }

  return (
    <PageShell>
      <PageHeader title={t('ipFilter.title')} />
      <ModuleMasterSwitch page="ip_filter">{content}</ModuleMasterSwitch>
    </PageShell>
  );
}
