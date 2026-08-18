'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import {
  Plus,
  Pencil,
  Trash2,
  Loader2,
  Download,
  Upload,
  TestTube,
  Ban,
  HelpCircle,
  AlertCircle,
  AlertTriangle,
  Zap,
  Shield,
  Clock,
  ChevronDown,
  ChevronUp,
  ChevronLeft,
  ChevronRight,
  Lightbulb,
  Play,
  Check,
  X,
  RotateCcw,
  Search,
  MoreHorizontal,
  Eye,
  Lock,
  RefreshCw,
} from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Checkbox } from '@/components/ui/checkbox';
import { Fragment } from 'react';
import { Button } from '@/components/ui/button';
import {
  getIPFrequencyRules,
  deleteIPFrequencyRule,
  setIPFrequencyRuleStatus,
  bulkIPFrequencyRules,
  exportIPFrequencyRules,
  importIPFrequencyRules,
  testIPFrequencyRule,
  getSuspendedIPs,
  getRuleSuspendedIPs,
  releaseSuspendedIP,
  bulkReleaseSuspendedIPs,
} from '@/lib/api/ip-frequency';
import type {
  IPFrequencyRuleView,
  IPFrequencyRulePayload,
  IPFrequencyScopeType,
  IPFrequencyAction,
  IPFrequencyTestResponse,
  SuspendedIP,
} from '@/types/ip-frequency';
import { IPFrequencyActionKeys } from '@/types/ip-frequency';
import { getIPGroups } from '@/lib/api/ip-filter';
import { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import { toast } from 'sonner';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import {
  Collapsible,
  CollapsibleContent,
} from '@/components/ui/collapsible';
import { CollapsibleSectionTrigger } from '@/components/ui/collapsible-section-trigger';
import { cn } from '@/lib/utils';
import { ConfirmDialog } from '@/components/shared/confirm-dialog';
import { StatusBadge } from '@/components/shared/status-badge';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useApiRequest } from '@/lib/api/client';
import { PageHeader, PageShell } from '@/components/shared/page-shell';
import { format } from 'date-fns';
import { toRFC3339 } from '@/lib/format-time';
import { useAuth } from '@/contexts/auth-context';
import { ModuleMasterSwitch } from '@/components/security/ModuleMasterSwitch';
import { useApiErrorMessage } from '@/lib/api/use-api-error-message';

const ruleSchema = z.object({
  name: z.string().min(1, 'ipFrequency.nameRequired').max(50, 'ipFrequency.nameTooLong'),
  description: z.string().optional(),
  priority: z.number(),
  scope_type: z.enum(['all', 'single', 'range', 'group']),
  scope_value: z.string().optional(),
  action: z.enum(['reject', 'tempfail', 'disconnect']),
  daily_connection_limit: z.number(),
  concurrent_connection_limit: z.number(),
  window_minutes: z.number().min(-1, 'ipFrequency.windowMinutesInvalid'),
  window_connection_limit: z.number(),
  hourly_auth_failure_limit: z.number(),
  single_connection_command_error_limit: z.number(),
  single_connection_auth_failure_limit: z.number(),
  suspend_minutes: z.number().refine((v) => [0, 15, 30, 60, 120].includes(v), 'ipFrequency.suspendDurationInvalid'),
  tempfail_message: z.string().optional(),
  is_active: z.boolean().optional(),
  valid_from: z.string().optional(),
  valid_until: z.string().optional(),
}).superRefine((data, ctx) => {
  if (data.scope_type === 'single' && !/^\d{1,3}(\.\d{1,3}){3}$/.test(data.scope_value || '')) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['scope_value'], message: 'ipFrequency.invalidIp' });
  }
  if (data.scope_type === 'range' && !/^\d{1,3}(\.\d{1,3}){3}\/\d{1,2}$/.test(data.scope_value || '')) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['scope_value'], message: 'ipFrequency.invalidCidr' });
  }
  if (data.scope_type === 'group' && !data.scope_value) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['scope_value'], message: 'ipFrequency.scopeIpGroupRequired' });
  }
  if (data.valid_from && data.valid_until && new Date(data.valid_until) < new Date(data.valid_from)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['valid_until'], message: 'ipFrequency.validUntilBeforeFrom' });
  }
  if (data.window_minutes === -1 && data.window_connection_limit !== -1) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['window_connection_limit'], message: 'ipFrequency.windowLimitHint' });
  }
});

type RuleForm = z.infer<typeof ruleSchema>;

const defaultForm: RuleForm = {
  name: '',
  description: '',
  priority: 100,
  scope_type: 'all',
  scope_value: '',
  action: 'reject',
  daily_connection_limit: -1,
  concurrent_connection_limit: -1,
  window_minutes: 60,
  window_connection_limit: -1,
  hourly_auth_failure_limit: -1,
  single_connection_command_error_limit: -1,
  single_connection_auth_failure_limit: -1,
  suspend_minutes: 60,
  tempfail_message: '',
  is_active: true,
  valid_from: '',
  valid_until: '',
};

export function IPFrequencyPage({
  embedded,
  showPlatformScopeBadge,
}: {
  embedded?: boolean;
  showPlatformScopeBadge?: boolean;
} = {}) {
  const t = useTranslations();
  const apiErrorMessage = useApiErrorMessage();
  const queryClient = useQueryClient();
  const { apiRequest } = useApiRequest();
  const { isSystemAdmin } = useAuth();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingRule, setEditingRule] = useState<IPFrequencyRuleView | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<{ id: number; name: string } | null>(null);
  const [releaseOnDelete, setReleaseOnDelete] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [search, setSearch] = useState('');
  const [scopeFilter, setScopeFilter] = useState<string>('');
  const [activeFilter, setActiveFilter] = useState<string>('');
  const [pageSize, setPageSize] = useState<number>(20);
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [suspendedDrawerOpen, setSuspendedDrawerOpen] = useState(false);
  const [expandedIds, setExpandedIds] = useState<Set<number>>(new Set());
  const [ruleSuspendedTarget, setRuleSuspendedTarget] = useState<IPFrequencyRuleView | null>(null);
  const [ruleSuspendedIPs, setRuleSuspendedIPs] = useState<SuspendedIP[]>([]);
  const [ruleSuspendedLoading, setRuleSuspendedLoading] = useState(false);
  const [ruleSuspendedSelected, setRuleSuspendedSelected] = useState<string[]>([]);
  const [testDialogOpen, setTestDialogOpen] = useState(false);
  const [testIp, setTestIp] = useState('');
  const [testResult, setTestResult] = useState<IPFrequencyTestResponse | null>(null);
  const [testLoading, setTestLoading] = useState(false);
  const [showZeroConfirm, setShowZeroConfirm] = useState(false);
  const [discardChangesOpen, setDiscardChangesOpen] = useState(false);
  const [showExamples, setShowExamples] = useState(false);
  const [showSimulator, setShowSimulator] = useState(false);
  const [simulatorIp, setSimulatorIp] = useState('192.168.1.1');
  const [simulatorCount, setSimulatorCount] = useState(100);
  const [simulatorResult, setSimulatorResult] = useState<{
    hit: boolean;
    reason: string;
    diff?: number;
  } | null>(null);

  const queryKey = ['ip-frequency-rules', scopeFilter, activeFilter];

  const { data: rulesData, isLoading } = useQuery({
    queryKey,
    queryFn: () =>
      getIPFrequencyRules(
        {
          page_size: 10000,
          scope_type: scopeFilter || undefined,
          is_active: activeFilter === 'true' ? true : activeFilter === 'false' ? false : undefined,
        },
        apiRequest,
      ),
    enabled: embedded || isSystemAdmin,
  });

  // GT-11795: extend search to also match rule id and IP/CIDR (client-side filter,
  // since backend `q` only matches rule name). The list is fetched in full
  // (page_size=10000) so client-side filtering is safe.
  const filteredItems = useMemo(() => {
    const items = rulesData?.items || [];
    if (!search) return items;
    const term = search.trim().toLowerCase();
    if (!term) return items;
    return items.filter((rule) => {
      const idStr = String(rule.Rule.id);
      const name = (rule.Rule.name || '').toLowerCase();
      const ip = (rule.ScopeValue || '').toLowerCase();
      return idStr.includes(term) || name.includes(term) || ip.includes(term);
    });
  }, [rulesData, search]);

  // 客户端分页（对齐 demo layer-0：每页 pageSize 条，可翻页）。
  const totalPages = Math.max(1, Math.ceil(filteredItems.length / pageSize));
  const paginatedItems = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredItems.slice(start, start + pageSize);
  }, [filteredItems, currentPage, pageSize]);

  // 筛选/搜索/每页条数变化时回到第 1 页；页数收缩时把当前页夹到合法范围。
  useEffect(() => {
    setCurrentPage(1);
  }, [search, scopeFilter, activeFilter, pageSize]);
  useEffect(() => {
    if (currentPage > totalPages) setCurrentPage(totalPages);
  }, [totalPages, currentPage]);

  // GT-12132：组范围的组源 = 全局 IP 组（_meta/groups?type=ip，与 IP 黑白名单同源）
  const { data: ipGroupsData } = useQuery({
    queryKey: ['ip-groups'],
    queryFn: () => getIPGroups(apiRequest),
    staleTime: 30_000,
  });
  const ipGroupOptions = ipGroupsData?.items ?? [];
  const ipGroupLabel = useCallback(
    (ruleId: string) => ipGroupOptions.find((g) => String(g.rule_id) === ruleId)?.label,
    [ipGroupOptions],
  );

  const { data: suspendedIPs = [] } = useQuery({
    queryKey: ['ip-frequency-suspended'],
    queryFn: () => getSuspendedIPs(apiRequest),
    enabled: (embedded || isSystemAdmin) && suspendedDrawerOpen,
  });

  // Layer 2: per-rule suspended IPs - loaded on demand when a rule's
  // "view suspended IPs" is triggered from the expanded detail row.
  useEffect(() => {
    if (ruleSuspendedTarget) {
      setRuleSuspendedLoading(true);
      setRuleSuspendedSelected([]);
      getRuleSuspendedIPs(ruleSuspendedTarget.Rule.id, apiRequest)
        .then((ips) => setRuleSuspendedIPs(ips))
        .catch(() => setRuleSuspendedIPs([]))
        .finally(() => setRuleSuspendedLoading(false));
    } else {
      setRuleSuspendedIPs([]);
    }
  }, [ruleSuspendedTarget, apiRequest]);

  const toggleExpand = useCallback((id: number) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  const form = useForm<RuleForm>({
    resolver: zodResolver(ruleSchema),
    defaultValues: defaultForm,
  });
  // React Hook Form publishes formState on the next render. A close event can
  // arrive immediately after an input event (for example, typing then pressing
  // Escape), so retain the synchronous event signal as well.
  const formDirtyRef = useRef(false);
  const initialFormSnapshotRef = useRef(JSON.stringify(defaultForm));
  const formElementRef = useRef<HTMLFormElement>(null);
  const initialFormDomSnapshotRef = useRef('');
  const isFormDirty = form.formState.isDirty;

  const serializeFormDom = useCallback(() => {
    const element = formElementRef.current;
    if (!element) return '';

    return Array.from(new FormData(element).entries())
      .map(([name, value]) => [name, typeof value === 'string' ? value : value.name] as const)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([name, value]) => `${encodeURIComponent(name)}=${encodeURIComponent(value)}`)
      .join('&');
  }, []);

  useEffect(() => {
    const subscription = form.watch(() => {
      formDirtyRef.current = true;
    });
    return () => subscription.unsubscribe();
  }, [form]);

  useEffect(() => {
    if (dialogOpen) {
      initialFormDomSnapshotRef.current = serializeFormDom();
    }
  }, [dialogOpen, serializeFormDom]);

  const requestCloseDialog = useCallback((eventDetails?: { preventUnmountOnClose: () => void }) => {
    const valuesChanged = JSON.stringify(form.getValues()) !== initialFormSnapshotRef.current;
    const domValuesChanged = serializeFormDom() !== initialFormDomSnapshotRef.current;
    if (formDirtyRef.current || isFormDirty || valuesChanged || domValuesChanged) {
      eventDetails?.preventUnmountOnClose();
      setDiscardChangesOpen(true);
      return;
    }
    setDialogOpen(false);
  }, [form, isFormDirty, serializeFormDom]);

  const deleteMutation = useMutation({
    mutationFn: ({ id, release }: { id: number; release: boolean }) =>
      deleteIPFrequencyRule(id, release, apiRequest),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ip-frequency-rules'] });
      toast.success(t('common.deleteSuccess'));
      setDeleteTarget(null);
      setReleaseOnDelete(false);
    },
    onError: (error: Error) => {
      toast.error(apiErrorMessage(error));
    },
  });

  const toggleMutation = useMutation({
    mutationFn: ({ id, isActive }: { id: number; isActive: boolean }) =>
      setIPFrequencyRuleStatus(id, isActive, false, apiRequest),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ip-frequency-rules'] });
      toast.success(t('common.updateSuccess'));
    },
    onError: (error: Error) => {
      toast.error(apiErrorMessage(error));
    },
  });

  const bulkMutation = useMutation({
    mutationFn: (data: { action: 'delete' | 'toggle'; ids: number[]; is_active?: boolean }) =>
      bulkIPFrequencyRules(data, apiRequest),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ip-frequency-rules'] });
      setSelectedIds([]);
      toast.success(t('common.updateSuccess'));
    },
    onError: (error: Error) => {
      toast.error(apiErrorMessage(error));
    },
  });

  const releaseMutation = useMutation({
    mutationFn: (ip: string) => releaseSuspendedIP(ip, apiRequest),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ip-frequency-suspended'] });
      toast.success(t('common.updateSuccess'));
    },
    onError: (error: Error) => {
      toast.error(apiErrorMessage(error));
    },
  });

  const releaseAllMutation = useMutation({
    mutationFn: () => bulkReleaseSuspendedIPs({ all: true }, apiRequest),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ip-frequency-suspended'] });
      toast.success(t('common.updateSuccess'));
    },
    onError: (error: Error) => {
      toast.error(apiErrorMessage(error));
    },
  });

  const handleOpenDialog = useCallback(
    (rule?: IPFrequencyRuleView) => {
      if (rule) {
        setEditingRule(rule);
        form.reset({
          name: rule.Rule.name,
          description: rule.Rule.description || '',
          priority: rule.Rule.priority,
          scope_type: rule.ScopeType as IPFrequencyScopeType,
          scope_value: rule.ScopeValue || '',
          action: rule.Rule.action as IPFrequencyAction,
          daily_connection_limit: rule.DailyConnectionLimit,
          concurrent_connection_limit: rule.ConcurrentConnectionLimit,
          window_minutes: rule.WindowMinutes,
          window_connection_limit: rule.WindowConnectionLimit,
          hourly_auth_failure_limit: rule.HourlyAuthFailureLimit,
          single_connection_command_error_limit: rule.SingleConnectionCommandErrorLimit,
          single_connection_auth_failure_limit: rule.SingleConnectionAuthFailureLimit,
          suspend_minutes: rule.SuspendMinutes,
          tempfail_message: rule.TempfailMessage || '',
          is_active: rule.Rule.is_active,
          valid_from: rule.Rule.valid_from ? rule.Rule.valid_from.slice(0, 16) : '',
          valid_until: rule.Rule.valid_until ? rule.Rule.valid_until.slice(0, 16) : '',
        });
      } else {
        setEditingRule(null);
        form.reset(defaultForm);
      }
      formDirtyRef.current = false;
      initialFormSnapshotRef.current = JSON.stringify(form.getValues());
      setShowZeroConfirm(false);
      setDiscardChangesOpen(false);
      setShowExamples(false);
      setShowSimulator(false);
      setSimulatorResult(null);
      setDialogOpen(true);
    },
    [form],
  );

  const onSubmit = form.handleSubmit(async (data) => {
    const thresholds = [
      data.daily_connection_limit,
      data.concurrent_connection_limit,
      data.window_connection_limit,
      data.hourly_auth_failure_limit,
      data.single_connection_command_error_limit,
      data.single_connection_auth_failure_limit,
    ];
    if (thresholds.every((v) => v === -1)) {
      toast.warning(t('ipFrequency.allThresholdsDisabled'));
    }
    if (thresholds.every((v) => v === 0) && !showZeroConfirm) {
      setShowZeroConfirm(true);
      return;
    }
    setIsSubmitting(true);
    try {
      const payload: IPFrequencyRulePayload = {
        ...data,
        valid_from: toRFC3339(data.valid_from),
        valid_until: toRFC3339(data.valid_until),
        tempfail_message: data.tempfail_message || undefined,
        scope_value: data.scope_type === 'all' ? undefined : data.scope_value,
      };
      if (editingRule) {
        await apiRequest(`/ip-frequency/rules/${editingRule.Rule.id}`, {
          method: 'PUT',
          body: payload,
        });
      } else {
        await apiRequest('/ip-frequency/rules', {
          method: 'POST',
          body: payload,
        });
      }
      queryClient.invalidateQueries({ queryKey: ['ip-frequency-rules'] });
      toast.success(t(editingRule ? 'common.updateSuccess' : 'common.createSuccess'));
      setDialogOpen(false);
      setShowZeroConfirm(false);
    } catch {
      toast.error(t('common.error'));
    } finally {
      setIsSubmitting(false);
    }
  });

  const handleExport = async () => {
    try {
      const result = await exportIPFrequencyRules(apiRequest);
      const blob = new Blob([JSON.stringify(result, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `ip-frequency-rules-${format(new Date(), 'yyyy-MM-dd')}.json`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success(t('common.updateSuccess'));
    } catch {
      toast.error(t('common.error'));
    }
  };

  const handleImport = async () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;
      try {
        const text = await file.text();
        const parsed = JSON.parse(text);
        const rules: IPFrequencyRulePayload[] = (parsed.items || parsed.rules || parsed.data || []).map(
          (r: IPFrequencyRuleView) => ({
            name: r.Rule.name,
            description: r.Rule.description,
            priority: r.Rule.priority,
            scope_type: r.ScopeType as IPFrequencyScopeType,
            scope_value: r.ScopeValue,
            action: r.Rule.action as IPFrequencyAction,
            daily_connection_limit: r.DailyConnectionLimit,
            concurrent_connection_limit: r.ConcurrentConnectionLimit,
            window_minutes: r.WindowMinutes,
            window_connection_limit: r.WindowConnectionLimit,
            hourly_auth_failure_limit: r.HourlyAuthFailureLimit,
            single_connection_command_error_limit: r.SingleConnectionCommandErrorLimit,
            single_connection_auth_failure_limit: r.SingleConnectionAuthFailureLimit,
            suspend_minutes: r.SuspendMinutes,
            tempfail_message: r.TempfailMessage,
            is_active: r.Rule.is_active,
            valid_from: r.Rule.valid_from,
            valid_until: r.Rule.valid_until,
          }),
        );
        const result = await importIPFrequencyRules({ rules }, apiRequest);
        queryClient.invalidateQueries({ queryKey: ['ip-frequency-rules'] });
        toast.success(t('ipFrequency.imported', { imported: result.imported, total: result.total }));
        // GT-11794: backend may return errors=null on success; guard before .length
        if (result.errors && result.errors.length > 0) {
          toast.error(result.errors.join('; '));
        }
      } catch {
        toast.error(t('common.error'));
      }
    };
    input.click();
  };

  const handleTest = async () => {
    if (!testIp) return;
    setTestLoading(true);
    setTestResult(null);
    try {
      const values = form.getValues();
      const result = await testIPFrequencyRule(
        {
          name: values.name,
          priority: values.priority,
          scope_type: values.scope_type,
          scope_value: values.scope_value,
          action: values.action,
          daily_connection_limit: values.daily_connection_limit,
          concurrent_connection_limit: values.concurrent_connection_limit,
          window_minutes: values.window_minutes,
          window_connection_limit: values.window_connection_limit,
          hourly_auth_failure_limit: values.hourly_auth_failure_limit,
          single_connection_command_error_limit: values.single_connection_command_error_limit,
          single_connection_auth_failure_limit: values.single_connection_auth_failure_limit,
          suspend_minutes: values.suspend_minutes,
          tempfail_message: values.tempfail_message,
          test_ip: testIp,
        },
        apiRequest,
      );
      setTestResult(result);
    } catch {
      toast.error(t('common.error'));
    } finally {
      setTestLoading(false);
    }
  };

  const scopeTypeLabel = (type: string) => {
    switch (type) {
      case 'all':
        return t('ipFrequency.scopeAll');
      case 'single':
        return t('ipFrequency.scopeSingle');
      case 'range':
        return t('ipFrequency.scopeRange');
      case 'group':
        return t('ipFrequency.scopeIpGroup');
      default:
        return type;
    }
  };

  const scopeTypeVariant = (type: string): 'success' | 'info' | 'warning' | 'default' => {
    switch (type) {
      case 'all':
        return 'success';
      case 'single':
        return 'info';
      case 'range':
        return 'warning';
      case 'group':
        return 'default';
      default:
        return 'default';
    }
  };

  const actionVariant = (action: string): 'error' | 'warning' | 'default' => {
    switch (action) {
      case 'reject':
        return 'error';
      case 'tempfail':
        return 'warning';
      case 'disconnect':
        return 'default';
      default:
        return 'default';
    }
  };

  const formatThreshold = (v: number) => (v <= 0 ? '-' : String(v));
  const formatTimeWindow = (minutes: number, limit: number) => {
    if (limit <= 0) return '-';
    return `${limit}次/${minutes}分钟`;
  };
  const formatSuspendDuration = (minutes: number) => {
    if (minutes === 0) return t('ipFrequency.suspendNone');
    if (minutes >= 60) return t('ipFrequency.suspendHourShort', { n: minutes / 60 });
    return t('ipFrequency.suspendMinutesShort', { n: minutes });
  };
  const formatExpireTime = (until: string | null) => {
    if (!until) return t('ipFrequency.always');
    const d = new Date(until);
    const now = new Date();
    const diffMs = d.getTime() - now.getTime();
    const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
    if (diffMs < 0) return t('ipFrequency.expired');
    if (diffDays <= 7) return <span className="text-red-500 font-medium">{format(d, 'yyyy-MM-dd')}</span>;
    return format(d, 'yyyy-MM-dd');
  };

  const watchScopeType = form.watch('scope_type');
  const watchAction = form.watch('action');
  const watchPriority = form.watch('priority');

  // GT-11792: client-side real-time priority-conflict check. Backend still
  // rejects on submit, but this surfaces the collision immediately while the
  // admin is editing — they no longer need to submit and read the 500 error.
  const { priorityConflict, priorityConflictName } = useMemo(() => {
    const all = rulesData?.items || [];
    const editingId = editingRule?.Rule.id;
    const hit = all.find((r) => r.Rule.priority === watchPriority && r.Rule.id !== editingId);
    if (hit) {
      return { priorityConflict: true, priorityConflictName: hit.Rule.name };
    }
    return { priorityConflict: false, priorityConflictName: '' };
  }, [rulesData, watchPriority, editingRule]);

  const previewConditions = useMemo(() => {
    const conditions: string[] = [];
    const daily = form.watch('daily_connection_limit');
    const concurrent = form.watch('concurrent_connection_limit');
    const windowMin = form.watch('window_minutes');
    const windowConn = form.watch('window_connection_limit');
    const authFail = form.watch('hourly_auth_failure_limit');
    const cmdErr = form.watch('single_connection_command_error_limit');
    const connAuth = form.watch('single_connection_auth_failure_limit');
    if (daily > 0) conditions.push(t('ipFrequency.preview.conditionDaily', { count: daily }));
    if (concurrent > 0) conditions.push(t('ipFrequency.preview.conditionConcurrent', { count: concurrent }));
    if (windowConn > 0) conditions.push(t('ipFrequency.preview.conditionWindow', { minutes: windowMin, count: windowConn }));
    if (authFail > 0) conditions.push(t('ipFrequency.preview.conditionAuthFail', { count: authFail }));
    if (cmdErr > 0) conditions.push(t('ipFrequency.preview.conditionCmdError', { count: cmdErr }));
    if (connAuth > 0) conditions.push(t('ipFrequency.preview.conditionConnAuthFail', { count: connAuth }));
    return conditions;
  }, [
    form.watch('daily_connection_limit'),
    form.watch('concurrent_connection_limit'),
    form.watch('window_minutes'),
    form.watch('window_connection_limit'),
    form.watch('hourly_auth_failure_limit'),
    form.watch('single_connection_command_error_limit'),
    form.watch('single_connection_auth_failure_limit'),
  ]);

  const allThresholdsUnlimited = useMemo(() => {
    const daily = form.watch('daily_connection_limit');
    const concurrent = form.watch('concurrent_connection_limit');
    const windowConn = form.watch('window_connection_limit');
    const authFail = form.watch('hourly_auth_failure_limit');
    const cmdErr = form.watch('single_connection_command_error_limit');
    const connAuth = form.watch('single_connection_auth_failure_limit');
    return daily <= 0 && concurrent <= 0 && windowConn <= 0 && authFail <= 0 && cmdErr <= 0 && connAuth <= 0;
  }, [
    form.watch('daily_connection_limit'),
    form.watch('concurrent_connection_limit'),
    form.watch('window_connection_limit'),
    form.watch('hourly_auth_failure_limit'),
    form.watch('single_connection_command_error_limit'),
    form.watch('single_connection_auth_failure_limit'),
  ]);

  const ipRangeCount = useMemo(() => {
    const scopeType = form.watch('scope_type');
    const scopeValue = form.watch('scope_value');
    if (scopeType === 'all') return null;
    if (scopeType === 'single') return 1;
    if (scopeType === 'group') return null;
    const cidrMatch = (scopeValue || '').match(/\/(\d+)$/);
    if (cidrMatch) {
      const prefix = parseInt(cidrMatch[1], 10);
      if (prefix >= 0 && prefix <= 32) return Math.pow(2, 32 - prefix);
    }
    return null;
  }, [form.watch('scope_type'), form.watch('scope_value')]);

  const suspendDisabledWithThresholds = form.watch('suspend_minutes') === 0 && previewConditions.length > 0;

  const suspendDurationText = useMemo(() => {
    const m = form.watch('suspend_minutes');
    if (m === 0) return null;
    if (m === 15) return t('ipFrequency.preview.suspend15minText');
    if (m === 30) return t('ipFrequency.preview.suspend30minText');
    if (m === 60) return t('ipFrequency.preview.suspend1hourText');
    if (m === 120) return t('ipFrequency.preview.suspend2hourText');
    return `${m} min`;
  }, [form.watch('suspend_minutes')]);

  const actionText = useMemo(() => {
    const action = form.watch('action');
    if (action === 'reject') return t('ipFrequency.preview.actionReject');
    if (action === 'tempfail') return t('ipFrequency.preview.actionTempfail');
    return t('ipFrequency.preview.actionDisconnect');
  }, [form.watch('action')]);

  const applyExample = (exampleId: string) => {
    if (exampleId === 'anti-bruteforce') {
      form.setValue('daily_connection_limit', -1);
      form.setValue('concurrent_connection_limit', -1);
      form.setValue('window_minutes', 60);
      form.setValue('window_connection_limit', -1);
      form.setValue('hourly_auth_failure_limit', 10);
      form.setValue('single_connection_command_error_limit', -1);
      form.setValue('single_connection_auth_failure_limit', -1);
      form.setValue('suspend_minutes', 60);
      form.setValue('action', 'reject');
    } else if (exampleId === 'anti-spam') {
      form.setValue('daily_connection_limit', 5000);
      form.setValue('concurrent_connection_limit', -1);
      form.setValue('window_minutes', 15);
      form.setValue('window_connection_limit', 200);
      form.setValue('hourly_auth_failure_limit', -1);
      form.setValue('single_connection_command_error_limit', -1);
      form.setValue('single_connection_auth_failure_limit', -1);
      form.setValue('suspend_minutes', 60);
      form.setValue('action', 'reject');
    }
    setShowExamples(false);
  };

  const runSimulation = () => {
    const windowConn = form.watch('window_connection_limit');
    const windowMin = form.watch('window_minutes');
    const daily = form.watch('daily_connection_limit');
    if (windowConn > 0 && simulatorCount >= windowConn) {
      setSimulatorResult({
        hit: true,
        reason: t('ipFrequency.simulator.windowHit', { count: simulatorCount, minutes: windowMin, limit: windowConn }),
      });
    } else if (daily > 0 && simulatorCount >= daily) {
      setSimulatorResult({
        hit: true,
        reason: t('ipFrequency.simulator.dailyHit', { count: simulatorCount, limit: daily }),
      });
    } else if (windowConn > 0) {
      setSimulatorResult({
        hit: false,
        reason: t('ipFrequency.simulator.notHitReason'),
        diff: windowConn - simulatorCount,
      });
    } else {
      setSimulatorResult({
        hit: false,
        reason: t('ipFrequency.simulator.noThresholds'),
      });
    }
  };

  if (!embedded && !isSystemAdmin) {
    return (
      <PageShell>
        <PageHeader title={t('navigation.ipFrequency')} />
        <div className="flex items-center justify-center py-20 text-muted-foreground">
          {t('common.notAuthorized')}
        </div>
      </PageShell>
    );
  }

  const actionButtons = (
    <div className="flex gap-2">
      <Button variant="outline" size="sm" onClick={() => setSuspendedDrawerOpen(true)}>
        <Ban className="h-4 w-4 mr-1" />
        {t('ipFrequency.suspendedIPs')}
      </Button>
      <Button variant="outline" size="sm" onClick={handleExport}>
        <Download className="h-4 w-4 mr-1" />
        {t('ipFrequency.export')}
      </Button>
      <Button variant="outline" size="sm" onClick={handleImport}>
        <Upload className="h-4 w-4 mr-1" />
        {t('ipFrequency.import')}
      </Button>
      <Button size="sm" onClick={() => handleOpenDialog()}>
        <Plus className="h-4 w-4 mr-1" />
        {t('ipFrequency.createRule')}
      </Button>
    </div>
  );

  const content = (
    <>
      <div className="space-y-4">
        {/* 蓝色说明卡，对齐 demo `bg-blue-50 ...` 风格 */}
        <div className="p-3 bg-blue-50 dark:bg-blue-950/30 rounded-lg border border-blue-200 dark:border-blue-800">
          <p className="text-sm text-blue-700 dark:text-blue-300">
            {t('ipFrequency.embeddedDescription')}
          </p>
        </div>

                {/* 搜索筛选行：左 search+filters+reset，右 操作按钮——对齐 demo FrequencyRuleFilters。
            保持与 demo 一致：不 flex-wrap，宽度按 demo 的 max-w-md / w-[120px] / w-[100px]。 */}
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 flex-1 min-w-0">
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
              <Input
                placeholder={t('ipFrequency.searchPlaceholder')}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9"
              />
            </div>
            <Select value={scopeFilter} onValueChange={(v) => v !== null && setScopeFilter(v as string)}
              items={{
                '': t('common.all'),
                all: t('ipFrequency.scopeAll'),
                single: t('ipFrequency.scopeSingle'),
                range: t('ipFrequency.scopeRange'),
                group: t('ipFrequency.scopeIpGroup'),
              }}
            >
              <SelectTrigger className="w-[120px] shrink-0">
                <SelectValue placeholder={t('ipFrequency.scopeFilter')} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="">{t('common.all')}</SelectItem>
                <SelectItem value="all">{t('ipFrequency.scopeAll')}</SelectItem>
                <SelectItem value="single">{t('ipFrequency.scopeSingle')}</SelectItem>
                <SelectItem value="range">{t('ipFrequency.scopeRange')}</SelectItem>
                <SelectItem value="group">{t('ipFrequency.scopeIpGroup')}</SelectItem>
              </SelectContent>
            </Select>
            <Select value={activeFilter} onValueChange={(v) => v !== null && setActiveFilter(v as string)}
              items={{
                '': t('common.all'),
                true: t('ipFrequency.active'),
                false: t('ipFrequency.inactive'),
              }}
            >
              <SelectTrigger className="w-[100px] shrink-0">
                <SelectValue placeholder={t('ipFrequency.statusFilter')} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="">{t('common.all')}</SelectItem>
                <SelectItem value="true">{t('ipFrequency.active')}</SelectItem>
                <SelectItem value="false">{t('ipFrequency.inactive')}</SelectItem>
              </SelectContent>
            </Select>
            <Button
              variant="outline"
              size="sm"
              className="shrink-0"
              onClick={() => {
                setSearch('');
                setScopeFilter('');
                setActiveFilter('');
              }}
            >
              <RotateCcw className="h-4 w-4 mr-1" />
              {t('ipFrequency.resetFilters')}
            </Button>
            {selectedIds.length > 0 && (
              <div className="flex gap-2 items-center flex-wrap ml-auto">
                <span className="text-sm text-muted-foreground">
                  {t('ipFrequency.selected', { count: selectedIds.length })}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => bulkMutation.mutate({ action: 'toggle', ids: selectedIds, is_active: true })}
                >
                  {t('ipFrequency.activate')}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => bulkMutation.mutate({ action: 'toggle', ids: selectedIds, is_active: false })}
                >
                  {t('ipFrequency.deactivate')}
                </Button>
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={() => bulkMutation.mutate({ action: 'delete', ids: selectedIds })}
                >
                  {t('common.delete')}
                </Button>
              </div>
            )}
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {actionButtons}
          </div>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin" />
          </div>
        ) : (
          <div className="space-y-4">
            <div className="overflow-hidden rounded-[24px] border border-border/70 bg-card/96 shadow-[0_12px_30px_rgba(15,23,42,0.05)]">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[40px]" />
                    <TableHead className="w-[40px]" />
                    <TableHead className="w-[60px]">{t('ipFrequency.ruleId')}</TableHead>
                    <TableHead>{t('ipFrequency.name')}</TableHead>
                    <TableHead className="w-[80px]">{t('ipFrequency.priority')}</TableHead>
                    <TableHead>{t('ipFrequency.ipAddress')}</TableHead>
                    <TableHead className="text-center">{t('ipFrequency.concurrentHeader')}</TableHead>
                    <TableHead className="text-center">{t('ipFrequency.timeWindowFreq')}</TableHead>
                    <TableHead className="text-center">{t('ipFrequency.dailyLimitHeader')}</TableHead>
                    <TableHead className="text-center">{t('ipFrequency.suspendPolicy')}</TableHead>
                    <TableHead>{t('ipFrequency.expireTimeHeader')}</TableHead>
                    <TableHead className="text-center">{t('common.status')}</TableHead>
                    <TableHead className="w-[120px]" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredItems.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={13} className="h-24 text-center text-muted-foreground">
                        {t('common.noData')}
                      </TableCell>
                    </TableRow>
                  ) : (
                    paginatedItems.map((rule) => {
                      const isExpanded = expandedIds.has(rule.Rule.id);
                      const isSelected = selectedIds.includes(rule.Rule.id);
                      return (
                        <Fragment key={rule.Rule.id}>
                          <TableRow className={cn(isSelected && 'bg-primary/5', !rule.Rule.is_active && 'opacity-60')}>
                            <TableCell>
                              <Checkbox
                                checked={isSelected}
                                onCheckedChange={() => {
                                  if (isSelected) {
                                    setSelectedIds(selectedIds.filter((id) => id !== rule.Rule.id));
                                  } else {
                                    setSelectedIds([...selectedIds, rule.Rule.id]);
                                  }
                                }}
                              />
                            </TableCell>
                            <TableCell>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-6 w-6"
                                onClick={() => toggleExpand(rule.Rule.id)}
                              >
                                {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                              </Button>
                            </TableCell>
                            <TableCell className="font-mono text-xs text-muted-foreground">{rule.Rule.id}</TableCell>
                            <TableCell>
                              <div className="flex flex-col gap-0.5">
                                <span className="font-medium">{rule.Rule.name}</span>
                                {rule.Rule.description && (
                                  <span className="text-xs text-muted-foreground line-clamp-1">{rule.Rule.description}</span>
                                )}
                              </div>
                            </TableCell>
                            <TableCell>
                              <Badge variant="outline" className="font-mono text-blue-600 dark:text-blue-400">
                                {rule.Rule.priority}
                              </Badge>
                            </TableCell>
                            <TableCell>
                              <div className="flex items-center gap-2">
                                <StatusBadge status={scopeTypeLabel(rule.ScopeType)} variant={scopeTypeVariant(rule.ScopeType)} />
                                {rule.ScopeValue && (
                                  <span className="text-xs text-muted-foreground font-mono">
                                    {rule.ScopeType === 'group'
                                      ? ipGroupLabel(rule.ScopeValue) ?? `#${rule.ScopeValue}`
                                      : rule.ScopeValue}
                                  </span>
                                )}
                              </div>
                            </TableCell>
                            <TableCell className="text-center font-mono text-sm">{formatThreshold(rule.ConcurrentConnectionLimit)}</TableCell>
                            <TableCell className="text-center text-sm">{formatTimeWindow(rule.WindowMinutes, rule.WindowConnectionLimit)}</TableCell>
                            <TableCell className="text-center font-mono text-sm">{formatThreshold(rule.DailyConnectionLimit)}</TableCell>
                            <TableCell className="text-center">
                              <Badge
                                variant={rule.SuspendMinutes === 0 ? 'secondary' : 'default'}
                                className={rule.SuspendMinutes !== 0 ? 'bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200' : ''}
                              >
                                {formatSuspendDuration(rule.SuspendMinutes)}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-sm">{formatExpireTime(rule.Rule.valid_until)}</TableCell>
                            <TableCell className="text-center">
                              {rule.IsExpired ? (
                                <StatusBadge status={t('ipFrequency.expired')} variant="error" />
                              ) : (
                                <StatusBadge
                                  status={rule.Rule.is_active ? t('ipFrequency.active') : t('ipFrequency.inactive')}
                                  variant={rule.Rule.is_active ? 'success' : 'default'}
                                />
                              )}
                            </TableCell>
                            <TableCell>
                              <div className="flex items-center gap-1">
                                <Switch
                                  checked={rule.Rule.is_active}
                                  onCheckedChange={(checked) =>
                                    toggleMutation.mutate({
                                      id: rule.Rule.id,
                                      isActive: checked as boolean,
                                    })
                                  }
                                />
                                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => handleOpenDialog(rule)}>
                                  <Pencil className="h-4 w-4" />
                                </Button>
                                <DropdownMenu>
                                  <DropdownMenuTrigger render={<Button variant="ghost" size="icon" className="h-8 w-8" />}>
                                    <MoreHorizontal className="h-4 w-4" />
                                  </DropdownMenuTrigger>
                                  <DropdownMenuContent align="end">
                                    <DropdownMenuItem onClick={() => setRuleSuspendedTarget(rule)}>
                                      <Eye className="h-4 w-4 mr-2" />
                                      {t('ipFrequency.viewSuspendedIPs')}
                                    </DropdownMenuItem>
                                    <DropdownMenuItem
                                      className="text-destructive"
                                      onClick={() => setDeleteTarget({ id: rule.Rule.id, name: rule.Rule.name })}
                                    >
                                      <Trash2 className="h-4 w-4 mr-2" />
                                      {t('ipFrequency.deleteRule')}
                                    </DropdownMenuItem>
                                  </DropdownMenuContent>
                                </DropdownMenu>
                              </div>
                            </TableCell>
                          </TableRow>
                          {isExpanded && (
                            <TableRow className="bg-muted/30 hover:bg-muted/30">
                              <TableCell colSpan={13} className="py-3">
                                <div className="grid grid-cols-4 gap-6 px-4">
                                  {/* IP级防护 */}
                                  <div className="space-y-2">
                                    <h5 className="text-xs font-medium text-muted-foreground uppercase tracking-wider">{t('ipFrequency.detailIpProtection')}</h5>
                                    <div className="space-y-1 text-sm">
                                      <div className="flex justify-between">
                                        <span className="text-muted-foreground">{t('ipFrequency.dailyLimit')}:</span>
                                        <span>{formatThreshold(rule.DailyConnectionLimit)}</span>
                                      </div>
                                      <div className="flex justify-between">
                                        <span className="text-muted-foreground">{t('ipFrequency.concurrentLimit')}:</span>
                                        <span>{formatThreshold(rule.ConcurrentConnectionLimit)}</span>
                                      </div>
                                      <div className="flex justify-between">
                                        <span className="text-muted-foreground">{t('ipFrequency.timeWindowFrequency')}:</span>
                                        <span>{formatTimeWindow(rule.WindowMinutes, rule.WindowConnectionLimit)}</span>
                                      </div>
                                      <div className="flex justify-between">
                                        <span className="text-muted-foreground">{t('ipFrequency.authFailHourlyLimit')}:</span>
                                        <span>{formatThreshold(rule.HourlyAuthFailureLimit)}</span>
                                      </div>
                                    </div>
                                  </div>
                                  {/* 单连接防护 */}
                                  <div className="space-y-2">
                                    <h5 className="text-xs font-medium text-muted-foreground uppercase tracking-wider">{t('ipFrequency.detailConnectionProtection')}</h5>
                                    <div className="space-y-1 text-sm">
                                      <div className="flex justify-between">
                                        <span className="text-muted-foreground">{t('ipFrequency.connCmdErrorLimit')}:</span>
                                        <span>{formatThreshold(rule.SingleConnectionCommandErrorLimit)}</span>
                                      </div>
                                      <div className="flex justify-between">
                                        <span className="text-muted-foreground">{t('ipFrequency.connAuthFailLimit')}:</span>
                                        <span>{formatThreshold(rule.SingleConnectionAuthFailureLimit)}</span>
                                      </div>
                                    </div>
                                  </div>
                                  {/* 处置动作 */}
                                  <div className="space-y-2">
                                    <h5 className="text-xs font-medium text-muted-foreground uppercase tracking-wider">{t('ipFrequency.detailAction')}</h5>
                                    <div className="space-y-1 text-sm">
                                      <div className="flex justify-between">
                                        <span className="text-muted-foreground">{t('ipFrequency.blockActionLabel')}:</span>
                                        <span>
                                          {rule.Rule.action === 'reject' ? t('ipFrequency.blockReject') : rule.Rule.action === 'tempfail' ? t('ipFrequency.blockError421') : t('ipFrequency.blockDisconnect')}
                                        </span>
                                      </div>
                                      <div className="flex justify-between">
                                        <span className="text-muted-foreground">{t('ipFrequency.suspendDurationLabel')}:</span>
                                        <span>{formatSuspendDuration(rule.SuspendMinutes)}</span>
                                      </div>
                                    </div>
                                  </div>
                                  {/* 统计信息 */}
                                  <div className="space-y-2">
                                    <h5 className="text-xs font-medium text-muted-foreground uppercase tracking-wider">{t('ipFrequency.detailStats')}</h5>
                                    <div className="space-y-1 text-sm">
                                      <div className="flex justify-between">
                                        <span className="text-muted-foreground">{t('ipFrequency.currentSuspended')}:</span>
                                        <Button
                                          variant="link"
                                          size="sm"
                                          className="h-auto p-0 text-blue-600"
                                          onClick={() => setRuleSuspendedTarget(rule)}
                                        >
                                          {t('ipFrequency.viewSuspendedList')}
                                        </Button>
                                      </div>
                                    </div>
                                  </div>
                                </div>
                              </TableCell>
                            </TableRow>
                          )}
                        </Fragment>
                      );
                    })
                  )}
                </TableBody>
              </Table>
            </div>
            <div className="flex flex-wrap items-center justify-end gap-2">
              <div className="mr-auto text-sm text-muted-foreground">
                {t('common.total', { count: filteredItems.length })}
              </div>
              <Select value={String(pageSize)} onValueChange={(v) => v !== null && setPageSize(Number(v))}
                items={{
                  '10': '10',
                  '20': '20',
                  '50': '50',
                  '100': '100',
                }}
              >
                <SelectTrigger className="h-8 w-[92px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {[10, 20, 50, 100].map((size) => (
                    <SelectItem key={size} value={String(size)}>{size}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                variant="outline"
                size="icon"
                className="h-8 w-8"
                disabled={currentPage <= 1}
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                aria-label={t('common.previous')}
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <div className="text-sm text-muted-foreground whitespace-nowrap">
                {t('common.pageOf', { current: currentPage, total: totalPages })}
              </div>
              <Button
                variant="outline"
                size="icon"
                className="h-8 w-8"
                disabled={currentPage >= totalPages}
                onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                aria-label={t('common.next')}
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        )}
      </div>

      <Sheet
        open={dialogOpen}
        onOpenChange={(open, eventDetails) => (open ? setDialogOpen(true) : requestCloseDialog(eventDetails))}
      >
        <SheetContent side="right" className="data-[side=right]:w-[960px] data-[side=right]:sm:max-w-[960px] p-0 flex flex-col" showCloseButton={false}>
          <SheetHeader className="px-6 py-4 border-b flex-shrink-0">
            <div className="flex items-center justify-between">
              <div>
                <SheetTitle className="text-lg font-semibold">
                  {editingRule ? t('ipFrequency.editRule') : t('ipFrequency.createRule')}
                </SheetTitle>
                <p className="text-sm text-muted-foreground mt-1">
                  {t('ipFrequency.description')}
                </p>
              </div>
            </div>
          </SheetHeader>

          <div className="flex flex-1 overflow-hidden min-h-0">
            {/* Left column: form - fixed width */}
            <div className="w-[580px] shrink-0 overflow-y-auto p-6 border-r">
          <form
            ref={formElementRef}
            onSubmit={onSubmit}
            onInputCapture={() => {
              formDirtyRef.current = true;
            }}
            onChange={() => {
              formDirtyRef.current = true;
            }}
          >
            <TooltipProvider>
              <div className="space-y-6">
                {/* 基础设置 */}
                <div className="space-y-4">
                  <div className="flex items-center gap-2">
                    <div className="h-5 w-1 rounded-full bg-blue-500" />
                    <h3 className="font-medium">{t('ipFrequency.basicSettings')}</h3>
                  </div>

                  <div className="space-y-3 pl-3">
                    {/* 规则名称 */}
                    <div className="flex items-start gap-3">
                      <Label className="min-w-[110px] w-[110px] shrink-0 whitespace-nowrap text-right pt-2">
                        <span className="text-red-500">*</span> {t('ipFrequency.ruleName')}
                      </Label>
                      <div className="flex-1">
                        <Input
                          placeholder={t('ipFrequency.ruleNamePlaceholder')}
                          {...form.register('name')}
                          className={cn(form.formState.errors.name && 'border-red-500')}
                        />
                        {form.formState.errors.name && (
                          <p className="text-xs text-red-500 mt-1">{t(form.formState.errors.name.message as never)}</p>
                        )}
                      </div>
                    </div>

                    {/* 生效范围 */}
                    <div className="flex items-center gap-3">
                      <Label className="min-w-[110px] w-[110px] shrink-0 whitespace-nowrap text-right">
                        {t('ipFrequency.scope')}
                      </Label>
                      <div className="flex items-center gap-2 flex-1">
                        <Select
                          value={form.watch('scope_type')}
                          onValueChange={(v) => {
                            if (v === null) return;
                            form.setValue('scope_type', v as IPFrequencyScopeType);
                            // 切换范围类型时清空旧值，避免把 IP 串带进 IP 组（或反之）
                            form.setValue('scope_value', '');
                          }}
                          items={{
                            all: t('ipFrequency.scopeAll'),
                            single: t('ipFrequency.scopeSingle'),
                            range: t('ipFrequency.scopeRange'),
                          }}
                        >
                          <SelectTrigger className="w-32" data-testid="ipfreq-scope-type">
                            <SelectValue placeholder={t('ipFrequency.scope')} />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="all">{t('ipFrequency.scopeAll')}</SelectItem>
                            <SelectItem value="single">{t('ipFrequency.scopeSingle')}</SelectItem>
                            <SelectItem value="range">{t('ipFrequency.scopeRange')}</SelectItem>
                            {/* GT-12132：后端已端到端支持组范围（scope_type=group，
                                scope_value=全局 IP 组规则 ID），组源为真实
                                _meta/groups?type=ip */}
                            <SelectItem value="group">{t('ipFrequency.scopeIpGroup')}</SelectItem>
                          </SelectContent>
                        </Select>
                        {(watchScopeType === 'single' || watchScopeType === 'range') && (
                          <Input
                            placeholder={watchScopeType === 'range' ? 'e.g. 192.168.1.0/24' : 'e.g. 192.168.1.1'}
                            {...form.register('scope_value')}
                            className={cn(
                              'flex-1',
                              form.formState.errors.scope_value && 'border-red-500',
                            )}
                          />
                        )}
                        {watchScopeType === 'group' && (
                          <Select
                            value={form.watch('scope_value') || ''}
                            onValueChange={(v) => v !== null && form.setValue('scope_value', v)}
                            items={Object.fromEntries(
                              ipGroupOptions.map((g) => [String(g.rule_id), g.label]),
                            )}
                          >
                            <SelectTrigger
                              className={cn('flex-1', form.formState.errors.scope_value && 'border-red-500')}
                              data-testid="ipfreq-scope-group"
                            >
                              <SelectValue placeholder={t('ipFrequency.ipGroupPlaceholder')} />
                            </SelectTrigger>
                            <SelectContent>
                              {ipGroupOptions.map((g) => (
                                <SelectItem key={g.rule_id} value={String(g.rule_id)}>
                                  {g.label}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        )}
                      </div>
                    </div>
                    {form.formState.errors.scope_value && (
                      <div className="flex gap-3">
                        <div className="min-w-[110px] w-[110px] shrink-0" />
                        <p className="text-xs text-red-500">{t(form.formState.errors.scope_value.message as never)}</p>
                      </div>
                    )}

                    {/* 生效时间 */}
                    <div className="flex items-center gap-3">
                      <Label className="min-w-[110px] w-[110px] shrink-0 whitespace-nowrap text-right">
                        {t('ipFrequency.validFrom')}
                      </Label>
                      <Input
                        type="datetime-local"
                        {...form.register('valid_from')}
                        className="w-56"
                      />
                    </div>

                    {/* 有效期至 */}
                    <div className="flex items-center gap-3">
                      <Label className="min-w-[110px] w-[110px] shrink-0 whitespace-nowrap text-right">
                        {t('ipFrequency.expireTime')}
                      </Label>
                      <div className="flex items-center gap-2">
                        <Input
                          type="datetime-local"
                          {...form.register('valid_until')}
                          className="w-56"
                        />
                        <span className="text-xs text-muted-foreground whitespace-nowrap">
                          ({t('ipFrequency.expireTimePermanent')})
                        </span>
                      </div>
                    </div>

                    {/* 优先级 */}
                    <div className="flex items-center gap-3">
                      <Label className="min-w-[110px] w-[110px] shrink-0 whitespace-nowrap text-right flex items-center justify-end gap-1">
                        {t('ipFrequency.priority')}
                        <Tooltip>
                          <TooltipTrigger render={<HelpCircle className="h-3.5 w-3.5 text-muted-foreground" />} />
                          <TooltipContent>
                            <p>{t('ipFrequency.priorityTip')}</p>
                          </TooltipContent>
                        </Tooltip>
                      </Label>
                      <div className="flex items-center gap-2">
                        <Input
                          type="number"
                          {...form.register('priority', { valueAsNumber: true })}
                          className={cn('w-[100px]', priorityConflict && 'border-amber-500')}
                          min={0}
                        />
                        <span className="text-xs text-muted-foreground whitespace-nowrap">
                          {t('ipFrequency.priorityDesc')}
                        </span>
                      </div>
                    </div>
                    {priorityConflict && (
                      <div className="flex gap-3">
                        <div className="min-w-[110px] w-[110px] shrink-0" />
                        <p className="text-xs text-amber-600 flex items-center gap-1">
                          <AlertTriangle className="h-3 w-3" />
                          {priorityConflictName
                            ? t('ipFrequency.priorityConflict', { priority: watchPriority, name: priorityConflictName })
                            : t('ipFrequency.priorityConflictNew', { priority: watchPriority })}
                        </p>
                      </div>
                    )}

                    {/* 备注 */}
                    <div className="flex items-start gap-3">
                      <Label className="min-w-[110px] w-[110px] shrink-0 whitespace-nowrap text-right pt-2">
                        {t('ipFrequency.descriptionField')}
                      </Label>
                      <Textarea
                        placeholder={t('ipFrequency.descriptionPlaceholder')}
                        {...form.register('description')}
                        className="flex-1 min-h-[60px]"
                      />
                    </div>

                    {/* 启用开关 */}
                    <div className="flex items-center gap-3">
                      <Label className="min-w-[110px] w-[110px] shrink-0 whitespace-nowrap text-right">
                        {t('ipFrequency.active')}
                      </Label>
                      <Switch
                        checked={form.watch('is_active')}
                        onCheckedChange={(v) => form.setValue('is_active', v)}
                      />
                    </div>
                  </div>
                </div>

                {/* IP级防护 */}
                <div className="space-y-4 border-t pt-4">
                  <div className="flex items-center gap-2">
                    <div className="h-5 w-1 rounded-full bg-amber-500" />
                    <h3 className="font-medium">{t('ipFrequency.ipLevelProtection')}</h3>
                    <span className="text-xs text-muted-foreground">
                      ({t('ipFrequency.negativeOneNoLimit')})
                    </span>
                  </div>

                  <div className="space-y-3 pl-3">
                    {/* 当天连接总数 */}
                    <div className="flex items-center gap-3">
                      <Label className="min-w-[110px] w-[110px] shrink-0 whitespace-nowrap text-right">
                        {t('ipFrequency.dailyLimit')}
                      </Label>
                      <div className="flex items-center gap-2">
                        <Input
                          type="number"
                          placeholder="-1"
                          {...form.register('daily_connection_limit', { valueAsNumber: true })}
                          className="w-[100px]"
                        />
                        <span className="text-sm text-muted-foreground whitespace-nowrap">
                          {t('ipFrequency.countUnit')}
                        </span>
                      </div>
                    </div>

                    {/* 并发连接上限 */}
                    <div className="flex items-center gap-3">
                      <Label className="min-w-[110px] w-[110px] shrink-0 whitespace-nowrap text-right">
                        {t('ipFrequency.concurrentLimit')}
                      </Label>
                      <div className="flex items-center gap-2">
                        <Input
                          type="number"
                          placeholder="-1"
                          {...form.register('concurrent_connection_limit', { valueAsNumber: true })}
                          className="w-[100px]"
                        />
                        <span className="text-sm text-muted-foreground whitespace-nowrap">
                          {t('ipFrequency.countUnit')}
                        </span>
                      </div>
                    </div>

                    {/* 时间窗口频率 */}
                    <div className="flex items-center gap-3">
                      <Label className="min-w-[110px] w-[110px] shrink-0 whitespace-nowrap text-right">
                        {t('ipFrequency.timeWindowFrequency')}
                      </Label>
                      <div className="inline-flex items-center gap-2">
                        <span className="text-sm whitespace-nowrap">{t('ipFrequency.every')}</span>
                        <Input
                          type="number"
                          {...form.register('window_minutes', { valueAsNumber: true })}
                          className="w-[72px]"
                          min={-1}
                        />
                        <span className="text-sm whitespace-nowrap">{t('ipFrequency.minutesUnit')}</span>
                        <Input
                          type="number"
                          placeholder="-1"
                          {...form.register('window_connection_limit', { valueAsNumber: true })}
                          className="w-[100px]"
                        />
                        <span className="text-sm text-muted-foreground whitespace-nowrap">
                          {t('ipFrequency.timesUnit')}
                        </span>
                      </div>
                    </div>
                    {form.formState.errors.window_connection_limit && (
                      <div className="flex gap-3">
                        <div className="min-w-[110px] w-[110px] shrink-0" />
                        <p className="text-xs text-red-500">
                          {t(form.formState.errors.window_connection_limit.message as never)}
                        </p>
                      </div>
                    )}

                    {/* 认证失败限制 */}
                    <div className="flex items-center gap-3">
                      <Label className="min-w-[110px] w-[110px] shrink-0 whitespace-nowrap text-right flex items-center justify-end gap-1">
                        {t('ipFrequency.authFailHourlyLimit')}
                        <Tooltip>
                          <TooltipTrigger render={<HelpCircle className="h-3.5 w-3.5 text-muted-foreground" />} />
                          <TooltipContent>
                            <p>{t('ipFrequency.authFailTip')}</p>
                          </TooltipContent>
                        </Tooltip>
                      </Label>
                      <div className="inline-flex items-center gap-2">
                        <span className="text-sm whitespace-nowrap">{t('ipFrequency.perHour')}</span>
                        <Input
                          type="number"
                          placeholder="-1"
                          {...form.register('hourly_auth_failure_limit', { valueAsNumber: true })}
                          className="w-[100px]"
                        />
                        <span className="text-sm text-muted-foreground whitespace-nowrap">
                          {t('ipFrequency.timesUnit')}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* 单连接防护 */}
                <div className="space-y-4 border-t pt-4">
                  <div className="flex items-center gap-2">
                    <div className="h-5 w-1 rounded-full bg-green-500" />
                    <h3 className="font-medium">{t('ipFrequency.connectionProtection')}</h3>
                    <span className="text-xs text-muted-foreground">
                      ({t('ipFrequency.negativeOneNoLimit')})
                    </span>
                  </div>

                  <div className="space-y-3 pl-3">
                    {/* 命令错误上限 */}
                    <div className="flex items-center gap-3">
                      <Label className="min-w-[110px] w-[110px] shrink-0 whitespace-nowrap text-right">
                        {t('ipFrequency.connCmdErrorLimit')}
                      </Label>
                      <div className="flex items-center gap-2">
                        <Input
                          type="number"
                          placeholder="-1"
                          {...form.register('single_connection_command_error_limit', { valueAsNumber: true })}
                          className="w-[100px]"
                        />
                        <span className="text-sm text-muted-foreground whitespace-nowrap">
                          {t('ipFrequency.timesUnit')}
                        </span>
                      </div>
                    </div>

                    {/* 认证失败上限 */}
                    <div className="flex items-center gap-3">
                      <Label className="min-w-[110px] w-[110px] shrink-0 whitespace-nowrap text-right">
                        {t('ipFrequency.connAuthFailLimit')}
                      </Label>
                      <div className="flex items-center gap-2">
                        <Input
                          type="number"
                          placeholder="3"
                          {...form.register('single_connection_auth_failure_limit', { valueAsNumber: true })}
                          className="w-[100px]"
                        />
                        <span className="text-sm text-muted-foreground whitespace-nowrap">
                          {t('ipFrequency.timesUnit')}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* 处置动作 */}
                <div className="space-y-4 border-t pt-4">
                  <div className="flex items-center gap-2">
                    <div className="h-5 w-1 rounded-full bg-red-500" />
                    <h3 className="font-medium">{t('ipFrequency.actionTitle')}</h3>
                  </div>

                  <div className="space-y-3 pl-3">
                    {/* 当次阻断 */}
                    <div className="flex items-center gap-3">
                      <Label className="min-w-[110px] w-[110px] shrink-0 whitespace-nowrap text-right">
                        {t('ipFrequency.blockActionLabel')}
                      </Label>
                      <Select
                        value={form.watch('action')}
                        onValueChange={(v) =>
                          v !== null && form.setValue('action', v as IPFrequencyAction)
                        }
                        items={{
                          reject: t('ipFrequency.blockReject'),
                          tempfail: t('ipFrequency.blockError421'),
                          disconnect: t('ipFrequency.blockDisconnect'),
                        }}
                      >
                        <SelectTrigger className="w-48">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="reject">{t('ipFrequency.blockReject')}</SelectItem>
                          <SelectItem value="tempfail">{t('ipFrequency.blockError421')}</SelectItem>
                          <SelectItem value="disconnect">{t('ipFrequency.blockDisconnect')}</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    {/* 临时拒绝消息 */}
                    {watchAction === 'tempfail' && (
                      <div className="flex items-center gap-3">
                        <Label className="min-w-[110px] w-[110px] shrink-0 whitespace-nowrap text-right">
                          {t('ipFrequency.tempfailMessage')}
                        </Label>
                        <Input
                          {...form.register('tempfail_message')}
                          placeholder={t('ipFrequency.tempfailPlaceholder')}
                          className="flex-1"
                        />
                      </div>
                    )}

                    {/* IP挂起 */}
                    <div className="flex items-center gap-3">
                      <Label className="min-w-[110px] w-[110px] shrink-0 whitespace-nowrap text-right flex items-center justify-end gap-1">
                        {t('ipFrequency.suspendDurationLabel')}
                        <Tooltip>
                          <TooltipTrigger render={<HelpCircle className="h-3.5 w-3.5 text-muted-foreground" />} />
                          <TooltipContent>
                            <p>{t('ipFrequency.suspendTip')}</p>
                          </TooltipContent>
                        </Tooltip>
                      </Label>
                      <Select
                        value={String(form.watch('suspend_minutes'))}
                        onValueChange={(v) => v !== null && form.setValue('suspend_minutes', Number(v))}
                        items={{
                          '0': t('ipFrequency.suspendNone'),
                          '15': t('ipFrequency.suspend15min'),
                          '30': t('ipFrequency.suspend30min'),
                          '60': t('ipFrequency.suspend1hour'),
                          '120': t('ipFrequency.suspend2hour'),
                        }}
                      >
                        <SelectTrigger className="w-48">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="0">{t('ipFrequency.suspendNone')}</SelectItem>
                          <SelectItem value="15">{t('ipFrequency.suspend15min')}</SelectItem>
                          <SelectItem value="30">{t('ipFrequency.suspend30min')}</SelectItem>
                          <SelectItem value="60">{t('ipFrequency.suspend1hour')}</SelectItem>
                          <SelectItem value="120">{t('ipFrequency.suspend2hour')}</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    {form.formState.errors.suspend_minutes && (
                      <div className="flex gap-3">
                        <div className="min-w-[110px] w-[110px] shrink-0" />
                        <p className="text-xs text-red-500">
                          {t(form.formState.errors.suspend_minutes.message as never)}
                        </p>
                      </div>
                    )}
                  </div>
                </div>

                {/* 错误/警告提示 */}
                {form.formState.errors.valid_until && (
                  <Alert variant="destructive">
                    <AlertCircle className="h-4 w-4" />
                    <AlertDescription>{t(form.formState.errors.valid_until.message as never)}</AlertDescription>
                  </Alert>
                )}

                {showZeroConfirm && (
                  <Alert className="border-amber-500 bg-amber-50 dark:bg-amber-950/30">
                    <AlertTriangle className="h-4 w-4 text-amber-600" />
                    <AlertDescription className="text-amber-700 dark:text-amber-300">
                      {t('ipFrequency.zeroConfirmWarning')}
                    </AlertDescription>
                  </Alert>
                )}

                {/* 底部提示 */}
                <div className="flex items-center justify-between text-xs text-muted-foreground border-t pt-4">
                  <span>{t('ipFrequency.orRelationTip')}</span>
                </div>
              </div>
            </TooltipProvider>
          </form>
            </div>

            {/* Right column: preview and help */}
            <div className="flex-1 overflow-y-auto bg-muted/30 p-6">
              <div className="space-y-6">
                {/* Effect Preview */}
                <div className="bg-card rounded-lg p-5 border">
                  <div className="flex items-center gap-2 mb-3">
                    <Zap className="h-4 w-4 text-blue-500" />
                    <h3 className="font-medium text-sm">{t('ipFrequency.preview.title')}</h3>
                  </div>

                  {allThresholdsUnlimited && (
                    <Alert className="mb-3 border-amber-500 bg-amber-50 dark:bg-amber-950/30">
                      <AlertTriangle className="h-4 w-4 text-amber-600" />
                      <AlertDescription className="text-amber-700 dark:text-amber-300 text-xs">
                        {t('ipFrequency.preview.allUnlimited')}
                      </AlertDescription>
                    </Alert>
                  )}

                  <div className="space-y-2.5 text-xs">
                    <div className="flex items-start gap-2">
                      <Shield className="h-3.5 w-3.5 text-muted-foreground mt-0.5" />
                      <div>
                        <span className="text-muted-foreground">{t('ipFrequency.preview.whenIP')}</span>
                        <Badge variant="secondary" className="mx-1 font-mono text-[10px] px-1.5 py-0">
                          {watchScopeType === 'all'
                            ? t('ipFrequency.preview.allIP')
                            : watchScopeType === 'group'
                              ? ipGroupLabel(form.watch('scope_value') || '') ||
                                t('ipFrequency.preview.notFilled')
                              : form.watch('scope_value') || t('ipFrequency.preview.notFilled')}
                        </Badge>
                        {ipRangeCount && ipRangeCount > 1 && (
                          <span className="text-muted-foreground">
                            {t('ipFrequency.preview.affectAbout', { count: ipRangeCount.toLocaleString() })}
                          </span>
                        )}
                      </div>
                    </div>

                    {previewConditions.length > 0 ? (
                      <div className="flex items-start gap-2">
                        <Ban className="h-3.5 w-3.5 text-muted-foreground mt-0.5" />
                        <div>
                          <span className="text-muted-foreground">{t('ipFrequency.preview.triggerCondition')}</span>
                          <ul className="mt-1 space-y-0.5">
                            {previewConditions.map((condition, i) => (
                              <li key={i} className="flex items-center gap-1.5">
                                <span className="w-1 h-1 rounded-full bg-amber-500 shrink-0" />
                                {condition}
                              </li>
                            ))}
                          </ul>
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2 text-muted-foreground">
                        <Ban className="h-3.5 w-3.5" />
                        <span>{t('ipFrequency.preview.noConditions')}</span>
                      </div>
                    )}

                    <div className="flex items-start gap-2">
                      <Clock className="h-3.5 w-3.5 text-muted-foreground mt-0.5" />
                      <div>
                        <span className="text-muted-foreground">{t('ipFrequency.preview.systemWill')}</span>
                        <span className="ml-1">{actionText}</span>
                        {suspendDurationText && (
                          <span>，{t('ipFrequency.preview.suspendFor', { duration: suspendDurationText })}</span>
                        )}
                      </div>
                    </div>

                    {suspendDisabledWithThresholds && (
                      <div className="pl-5 text-xs text-amber-600">
                        {t('ipFrequency.preview.suspendLogTip')}
                      </div>
                    )}

                    <div className="flex items-center gap-2">
                      <span className="text-muted-foreground">{t('ipFrequency.preview.priorityLabel')}</span>
                      <Badge variant="outline" className="font-mono text-[10px] px-1.5 py-0">
                        {form.watch('priority')}
                      </Badge>
                      <span className="text-muted-foreground">
                        {t('ipFrequency.preview.lowerFirst')}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Configuration Examples */}
                <Collapsible open={showExamples} onOpenChange={setShowExamples}>
                  <CollapsibleSectionTrigger className="px-3 py-1.5 text-xs">
                    <Lightbulb className="h-4 w-4" />
                    <span>{t('ipFrequency.examples.title')}</span>
                  </CollapsibleSectionTrigger>
                  <CollapsibleContent className="mt-2 space-y-2">
                    {[
                      {
                        id: 'anti-bruteforce',
                        name: t('ipFrequency.examples.antiBruteforce'),
                        desc: t('ipFrequency.examples.antiBruteforceDesc'),
                        effect: t('ipFrequency.examples.antiBruteforceEffect'),
                      },
                      {
                        id: 'anti-spam',
                        name: t('ipFrequency.examples.antiSpam'),
                        desc: t('ipFrequency.examples.antiSpamDesc'),
                        effect: t('ipFrequency.examples.antiSpamEffect'),
                      },
                    ].map((example) => (
                      <div key={example.id} className="rounded-lg border p-3 bg-muted/30">
                        <div className="flex items-start justify-between mb-1.5">
                          <div>
                            <h4 className="font-medium text-xs">{example.name}</h4>
                            <p className="text-[10px] text-muted-foreground">{example.desc}</p>
                          </div>
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-6 text-[10px] px-2"
                            onClick={() => applyExample(example.id)}
                          >
                            {t('ipFrequency.examples.useThis')}
                          </Button>
                        </div>
                        <p className="text-[10px] text-muted-foreground bg-muted/50 rounded p-1.5">
                          {example.effect}
                        </p>
                      </div>
                    ))}
                  </CollapsibleContent>
                </Collapsible>

                {/* Simulation Test */}
                <Collapsible open={showSimulator} onOpenChange={setShowSimulator}>
                  <CollapsibleSectionTrigger className="px-3 py-1.5 text-xs">
                    <Play className="h-4 w-4" />
                    <span>{t('ipFrequency.simulator.title')}</span>
                  </CollapsibleSectionTrigger>
                  <CollapsibleContent className="mt-2">
                    <div className="rounded-lg border p-3 bg-muted/30 space-y-3">
                      <div className="grid grid-cols-1 gap-2">
                        <div>
                          <Label className="text-[10px] mb-1 block">{t('ipFrequency.simulator.ip')}</Label>
                          <Input
                            value={simulatorIp}
                            onChange={(e) => setSimulatorIp(e.target.value)}
                            placeholder="192.168.1.1"
                            className="h-7 text-xs"
                          />
                        </div>
                        <div>
                          <Label className="text-[10px] mb-1 block">{t('ipFrequency.simulator.count')}</Label>
                          <Input
                            type="number"
                            value={simulatorCount}
                            onChange={(e) => setSimulatorCount(parseInt(e.target.value) || 0)}
                            className="h-7 text-xs"
                          />
                        </div>
                      </div>
                      <Button size="sm" className="w-full h-7 text-xs" onClick={runSimulation}>
                        {t('ipFrequency.simulator.start')}
                      </Button>
                      {simulatorResult && (
                        <div className={cn(
                          'rounded-lg p-2 text-xs',
                          simulatorResult.hit
                            ? 'bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800'
                            : 'bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-800',
                        )}>
                          <div className="flex items-center gap-1.5 mb-0.5">
                            {simulatorResult.hit ? (
                              <>
                                <X className="h-3.5 w-3.5 text-red-600" />
                                <span className="font-medium text-red-700 dark:text-red-400">{t('ipFrequency.simulator.hit')}</span>
                              </>
                            ) : (
                              <>
                                <Check className="h-3.5 w-3.5 text-green-600" />
                                <span className="font-medium text-green-700 dark:text-green-400">{t('ipFrequency.simulator.notHit')}</span>
                              </>
                            )}
                          </div>
                          <p className={cn(
                            'text-[10px]',
                            simulatorResult.hit ? 'text-red-600 dark:text-red-400' : 'text-green-600 dark:text-green-400',
                          )}>
                            {simulatorResult.reason}
                            {simulatorResult.diff !== undefined && simulatorResult.diff > 0 && (
                              <span className="block mt-0.5">
                                {t('ipFrequency.simulator.diffLeft', { diff: simulatorResult.diff })}
                              </span>
                            )}
                          </p>
                        </div>
                      )}
                    </div>
                  </CollapsibleContent>
                </Collapsible>

                {/* Configuration Tips */}
                <div className="bg-card rounded-lg p-4 border">
                  <h4 className="font-medium text-xs mb-2">{t('ipFrequency.tips.title')}</h4>
                  <ul className="space-y-1.5 text-[10px] text-muted-foreground">
                    <li className="flex items-center gap-1.5">
                      <span className="w-1 h-1 rounded-full bg-blue-500 shrink-0" />
                      {t('ipFrequency.tips.negOne')}
                    </li>
                    <li className="flex items-center gap-1.5">
                      <span className="w-1 h-1 rounded-full bg-blue-500 shrink-0" />
                      {t('ipFrequency.tips.priorityLower')}
                    </li>
                    <li className="flex items-center gap-1.5">
                      <span className="w-1 h-1 rounded-full bg-blue-500 shrink-0" />
                      {t('ipFrequency.tips.permanent')}
                    </li>
                    <li className="flex items-center gap-1.5">
                      <span className="w-1 h-1 rounded-full bg-blue-500 shrink-0" />
                      {t('ipFrequency.tips.orRelation')}
                    </li>
                  </ul>
                </div>
              </div>
            </div>
          </div>

          <div className="flex flex-shrink-0 justify-end gap-2 border-t px-6 py-4">
            <Button type="button" variant="outline" onClick={() => requestCloseDialog()}>
              {t('common.cancel')}
            </Button>
            <Button type="button" disabled={isSubmitting} onClick={onSubmit}>
              {isSubmitting && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              {t('common.save')}
            </Button>
          </div>
        </SheetContent>
      </Sheet>

      <ConfirmDialog
        open={discardChangesOpen}
        onOpenChange={setDiscardChangesOpen}
        title={t('common.unsavedChanges')}
        description={t('common.unsavedChangesDesc')}
        confirmText={t('common.discard')}
        onConfirm={() => {
          setDiscardChangesOpen(false);
          setDialogOpen(false);
        }}
        variant="destructive"
      />

      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(open) => {
          if (!open) {
            setDeleteTarget(null);
            setReleaseOnDelete(false);
          }
        }}
        title={t('ipFrequency.deleteRule')}
        description={t('ipFrequency.deleteConfirm', { name: deleteTarget?.name ?? '' })}
        onConfirm={() => {
          if (deleteTarget) {
            deleteMutation.mutate({ id: deleteTarget.id, release: releaseOnDelete });
          }
        }}
        variant="destructive"
      />

      {deleteTarget && (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50">
          <label className="flex items-center gap-2 rounded-lg border bg-card px-4 py-2 shadow-lg text-sm">
            <input
              type="checkbox"
              checked={releaseOnDelete}
              onChange={(e) => setReleaseOnDelete(e.target.checked)}
              className="h-4 w-4"
            />
            {t('ipFrequency.releaseOnDelete')}
          </label>
        </div>
      )}

      <Dialog open={testDialogOpen} onOpenChange={setTestDialogOpen}>
        <DialogContent className="max-w-md rounded-[28px]">
          <DialogHeader>
            <DialogTitle>
              <TestTube className="h-5 w-5 inline mr-2" />
              {t('ipFrequency.testTitle')}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>{t('ipFrequency.testIpAddress')}</Label>
              <Input
                value={testIp}
                onChange={(e) => setTestIp(e.target.value)}
                placeholder={t('ipFrequency.testPlaceholder')}
              />
            </div>
            <Button onClick={handleTest} disabled={testLoading || !testIp} className="w-full">
              {testLoading && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              {t('ipFrequency.runTest')}
            </Button>
            {testResult && (
              <div className="rounded-md border p-3 space-y-2 text-sm">
                <div className="flex items-center gap-2">
                  <span className="font-medium">{t('ipFrequency.result')}:</span>
                  <StatusBadge
                    status={testResult.blocked ? t('ipFrequency.blocked') : t('ipFrequency.allowed')}
                    variant={testResult.blocked ? 'error' : 'success'}
                  />
                </div>
                {testResult.action && (
                  <div>
                    <span className="font-medium">{t('ipFrequency.action')}:</span> {testResult.action}
                  </div>
                )}
                {testResult.product_action && (
                  <div>
                    <span className="font-medium">{t('ipFrequency.productAction')}:</span> {testResult.product_action}
                  </div>
                )}
                {testResult.reason && (
                  <div>
                    <span className="font-medium">{t('ipFrequency.reason')}:</span> {testResult.reason}
                  </div>
                )}
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Layer 2: Global suspended IPs dialog (from toolbar button) */}
      <Dialog open={suspendedDrawerOpen} onOpenChange={setSuspendedDrawerOpen}>
        <DialogContent className="max-w-3xl max-h-[80vh] rounded-[28px]">
          <DialogHeader>
            <div className="flex items-center justify-between">
              <DialogTitle>{t('ipFrequency.suspendedIPs')}</DialogTitle>
              <div className="flex gap-2">
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={() => releaseAllMutation.mutate()}
                  disabled={suspendedIPs.length === 0}
                >
                  {t('ipFrequency.releaseAll')}
                </Button>
              </div>
            </div>
          </DialogHeader>
          <div className="overflow-auto max-h-[60vh]">
            {suspendedIPs.length === 0 ? (
              <div className="py-8 text-center text-muted-foreground">{t('ipFrequency.noSuspendedIPs')}</div>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left">
                    <th className="pb-2 font-medium">{t('ipFrequency.ipHeader')}</th>
                    <th className="pb-2 font-medium">{t('ipFrequency.ruleHeader')}</th>
                    <th className="pb-2 font-medium">{t('ipFrequency.suspendedHeader')}</th>
                    <th className="pb-2 font-medium">{t('ipFrequency.expiresHeader')}</th>
                    <th className="pb-2 font-medium">{t('ipFrequency.reasonHeader')}</th>
                    <th className="pb-2"></th>
                  </tr>
                </thead>
                <tbody>
                  {suspendedIPs.map((s: SuspendedIP) => (
                    <tr key={s.ip} className="border-b last:border-0">
                      <td className="py-2 font-mono text-xs">{s.ip}</td>
                      <td className="py-2 text-xs">{s.rule_name}</td>
                      <td className="py-2 text-xs text-muted-foreground">
                        {format(new Date(s.suspended_at), 'MM-dd HH:mm')}
                      </td>
                      <td className="py-2 text-xs text-muted-foreground">
                        {format(new Date(s.expires_at), 'MM-dd HH:mm')}
                      </td>
                      <td className="py-2 text-xs text-muted-foreground max-w-[200px] truncate">{s.reason}</td>
                      <td className="py-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => releaseMutation.mutate(s.ip)}
                          className="text-xs"
                        >
                          {t('ipFrequency.release')}
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Layer 2: Per-rule suspended IPs Sheet (from expanded detail or more menu) */}
      <Sheet open={!!ruleSuspendedTarget} onOpenChange={(open) => { if (!open) setRuleSuspendedTarget(null); }}>
        <SheetContent side="right" className="w-[500px] sm:w-[600px] p-0 flex flex-col" showCloseButton>
          <SheetHeader className="px-4 py-4 border-b flex-shrink-0">
            <SheetTitle>
              {t('ipFrequency.currentSuspendedIPs', { count: ruleSuspendedIPs.length })}
            </SheetTitle>
            <p className="text-sm text-muted-foreground">
              {t('ipFrequency.suspendedRuleLabel')}: {ruleSuspendedTarget?.Rule.name || '-'}
            </p>
          </SheetHeader>
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            <div className="flex items-center justify-between">
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  if (ruleSuspendedSelected.length > 0) {
                    ruleSuspendedSelected.forEach((ip) => releaseMutation.mutate(ip));
                    setRuleSuspendedSelected([]);
                  }
                }}
                disabled={ruleSuspendedSelected.length === 0}
              >
                <Lock className="h-4 w-4 mr-1" />
                {t('ipFrequency.batchRelease', { count: ruleSuspendedSelected.length })}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  if (ruleSuspendedTarget) {
                    setRuleSuspendedLoading(true);
                    getRuleSuspendedIPs(ruleSuspendedTarget.Rule.id, apiRequest)
                      .then((ips) => setRuleSuspendedIPs(ips))
                      .finally(() => setRuleSuspendedLoading(false));
                  }
                }}
              >
                <RefreshCw className="h-4 w-4 mr-1" />
                {t('ipFrequency.refresh')}
              </Button>
            </div>
            {ruleSuspendedLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin" />
              </div>
            ) : ruleSuspendedIPs.length === 0 ? (
              <div className="py-8 text-center text-muted-foreground">{t('ipFrequency.noSuspendedIPs')}</div>
            ) : (
              <div className="border rounded-lg overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/50">
                      <TableHead className="w-[40px]" />
                      <TableHead>{t('ipFrequency.ipHeader')}</TableHead>
                      <TableHead>{t('ipFrequency.suspendedHeader')}</TableHead>
                      <TableHead>{t('ipFrequency.expiresHeader')}</TableHead>
                      <TableHead className="w-[80px]" />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {ruleSuspendedIPs.map((s) => (
                      <TableRow key={s.ip}>
                        <TableCell>
                          <Checkbox
                            checked={ruleSuspendedSelected.includes(s.ip)}
                            onCheckedChange={() => {
                              if (ruleSuspendedSelected.includes(s.ip)) {
                                setRuleSuspendedSelected(ruleSuspendedSelected.filter((ip) => ip !== s.ip));
                              } else {
                                setRuleSuspendedSelected([...ruleSuspendedSelected, s.ip]);
                              }
                            }}
                          />
                        </TableCell>
                        <TableCell>
                          <div className="space-y-0.5">
                            <span className="font-mono text-sm">{s.ip}</span>
                            <p className="text-xs text-muted-foreground">{s.reason}</p>
                          </div>
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {format(new Date(s.suspended_at), 'MM-dd HH:mm')}
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {format(new Date(s.expires_at), 'MM-dd HH:mm')}
                        </TableCell>
                        <TableCell>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 text-primary"
                            onClick={() => {
                              releaseMutation.mutate(s.ip);
                              setRuleSuspendedIPs(ruleSuspendedIPs.filter((item) => item.ip !== s.ip));
                            }}
                          >
                            {t('ipFrequency.release')}
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
            <div className="text-xs text-muted-foreground">
              <p>* {t('ipFrequency.releaseHint1')}</p>
              <p>* {t('ipFrequency.releaseHint2')}</p>
            </div>
          </div>
        </SheetContent>
      </Sheet>
    </>
  );

  if (embedded) {
    return <ModuleMasterSwitch page="ip_frequency">{content}</ModuleMasterSwitch>;
  }

  return (
    <PageShell>
      <PageHeader title={t('navigation.ipFrequency')} />
      <ModuleMasterSwitch page="ip_frequency">{content}</ModuleMasterSwitch>
    </PageShell>
  );
}
