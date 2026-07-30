'use client';

// 转发设置 Tab —— html_spec 对齐严格单表重构（Task 4）+ 接通真实后端（Task 13，
// design/implement/spec/2026-07-29-mail-routing-backend-design.md，doc/mail-routing.md §5）。
//
// 一条 mail-admission-rules 记录一行，8 列（优先级/来源 IP/发信域名/HELO EHLO/收信域名/垃圾邮件
// 过滤/状态/操作）——取代旧 relay-grants（已随后端一并退役，见 doc/mail-routing.md「已移除：
// /relay-grants*」）。优先级/HELO/收信域名+匹配方式现在都是后端真实列（mail_admission_rules
// 表），不再是 mock-only 扩展位，控件恒可编辑。grants 高级能力（主开关/限速/空发件人/any-sender/
// 特权手动开关）UI 不在本页（A7，另行安置）。
//
// 已知限制（未改后端，超出本次范围）：真实后端 `MailAdmissionRule.sender_domain` 是 JOIN 派生的
// 只读字段（tenant_domain_id → tenant_domains.domain），没有可直接写入的 sender_domain 列；本
// 单表用自由文本承载「发信域名」，保存时会尝试按精确域名（大小写不敏感）匹配租户已验证域名换算
// 出 tenant_domain_id，命中则按该域授权，未命中则退化为"任意发信域"（tenant_domain_id=null）
// ——不管哪种情形，只要没有具体域名 FK 或勾选了 SPF，真实后端都要求 privileged=true（仅
// system_admin，internal/api/mail_admission.go validateMailAdmissionRule），这里按输入静默推
// 导、不再暴露成手动开关（该开关属于 A7 移出的高级能力）。因此：① 未命中已验证域名时，发信域名
// 不会随后端往返持久化；② 保存操作需要 system_admin 权限（本页本就 system_admin-only）。
//
// rcpt_domain 匹配方式约束（后端 validateMailAdmissionRule）：非 system_admin 只能用
// rcpt_match=equals（contains/regex 需要 system_admin，跨租户域劫持防线）。本页整体是
// system_admin-only（mail-routing/page.tsx 的 isSystemAdmin 门禁），所以这条约束在本页实际
// 恒满足；仍保留 canPrivilege 判定作为纵深防御，避免未来复用本组件到非 system_admin 场景时静默
// 撞 400。

import { useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { Plus, Pencil, Trash2, Loader2, FlaskConical, Info } from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
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
import { EmptyState } from '@/components/shared/empty-state';
import { ListToolbar } from '@/components/mail-routing/shared/list-toolbar';
import type { RcptMatchType } from '@/components/mail-routing/mr-types';
import { useScopedApiRequest } from '@/lib/api/client';
import {
  getMailAdmissionRules,
  createMailAdmissionRule,
  updateMailAdmissionRule,
  deleteMailAdmissionRule,
  type MailAdmissionRule,
  type MailAdmissionRulePayload,
} from '@/lib/api/mail-admission';
import { listTenantDomains } from '@/lib/api/mail-routing';
import {
  ruleToRow,
  rowToRulePayload,
  sortRelayRows,
  emptyRelayRow,
  type RelayRuleRow,
} from './relay-mapping';
import { simulateRelay } from './relay-simulator';

interface RelayTabProps {
  tenantId: number;
}

interface Filters {
  sourceIp: string;
  fromDomain: string;
  rcptDomain: string;
  status: 'all' | 'enabled' | 'disabled';
}

const EMPTY_FILTERS: Filters = { sourceIp: '', fromDomain: '', rcptDomain: '', status: 'all' };

interface RelayWirePayload extends MailAdmissionRulePayload {
  sender_domain?: string | null;
}

const RCPT_MATCH_LABEL_KEY: Record<RcptMatchType, string> = {
  contains: 'fields.rcptMatchContains',
  equals: 'fields.rcptMatchEquals',
  regex: 'fields.rcptMatchRegex',
};

export function RelayTab({ tenantId }: RelayTabProps) {
  const t = useTranslations('mailRouting.relay');
  const ts = useTranslations('mailRouting.shared');
  const tc = useTranslations('common');
  const { apiRequest } = useScopedApiRequest(tenantId);
  const queryClient = useQueryClient();

  const queryKey = ['mail-admission-rules', tenantId];
  const { data: rules = [], isLoading } = useQuery({
    queryKey,
    queryFn: () => getMailAdmissionRules(apiRequest),
  });

  // 用于保存时把「发信域名」自由文本换算成 tenant_domain_id（见文件顶部注释）。
  const { data: domains = [], isLoading: domainsLoading } = useQuery({
    queryKey: ['mail-admission-domains', tenantId],
    queryFn: () => listTenantDomains(tenantId, apiRequest),
  });
  const verifiedDomains = domains.filter((d) => d.verify_status === 'verified' && d.is_active);

  const rows: RelayRuleRow[] = useMemo(() => sortRelayRows(rules.map(ruleToRow)), [rules]);

  const [search, setSearch] = useState('');
  const [filters, setFilters] = useState<Filters>({ ...EMPTY_FILTERS });

  const filteredRows = useMemo(() => {
    const kw = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (kw && !r.ruleName.toLowerCase().includes(kw)) return false;
      if (filters.sourceIp && !r.sourceIp.toLowerCase().includes(filters.sourceIp.toLowerCase())) return false;
      if (filters.fromDomain && !r.fromDomain.toLowerCase().includes(filters.fromDomain.toLowerCase())) return false;
      if (filters.rcptDomain && !r.rcptDomain.toLowerCase().includes(filters.rcptDomain.toLowerCase())) return false;
      if (filters.status !== 'all' && r.status !== filters.status) return false;
      return true;
    });
  }, [rows, search, filters]);

  const filterCount =
    (filters.sourceIp ? 1 : 0) +
    (filters.fromDomain ? 1 : 0) +
    (filters.rcptDomain ? 1 : 0) +
    (filters.status !== 'all' ? 1 : 0);

  const resetFilters = () => {
    setSearch('');
    setFilters({ ...EMPTY_FILTERS });
  };

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  // 编辑态原始规则（含 UI 不再暴露的高级字段 rate_limit_per_hour/expires_at/
  // allow_null_sender），保存 PUT 时原样透传，避免后端「省略字段=清空」把它们静默清掉
  // （review finding 2）。
  const [editingRule, setEditingRule] = useState<MailAdmissionRule | null>(null);
  const [draft, setDraft] = useState<RelayRuleRow>(emptyRelayRow());
  const [deleteTarget, setDeleteTarget] = useState<RelayRuleRow | null>(null);
  const [sim, setSim] = useState({ sourceIp: '', fromDomain: '', rcptDomain: '' });
  const [simResult, setSimResult] = useState<RelayRuleRow | null | undefined>(undefined);

  const invalidate = () => queryClient.invalidateQueries({ queryKey });

  const openCreate = () => {
    setDraft(emptyRelayRow());
    setEditingId(null);
    setEditingRule(null);
    setSim({ sourceIp: '', fromDomain: '', rcptDomain: '' });
    setSimResult(undefined);
    setDrawerOpen(true);
  };

  const openEdit = (row: RelayRuleRow) => {
    setDraft({ ...row });
    setEditingId(row.id);
    setEditingRule(rules.find((r) => r.id === row.id) ?? null);
    setSim({ sourceIp: '', fromDomain: '', rcptDomain: '' });
    setSimResult(undefined);
    setDrawerOpen(true);
  };

  const closeDrawer = () => {
    setDrawerOpen(false);
    setEditingId(null);
    setEditingRule(null);
  };

  // 发信域名换算成已验证租户域名 FK（见文件顶部注释）。未精确匹配时 tenantDomainId=null——
  // 这不只是"发信域名不会持久化"的降级，若因此静默提交 privileged:true 就等于未经确认地开放
  // 了一个 any-sender/open-relay 授权（review finding 1）。因此下面把它提升为阻断保存的校验
  // 错误，而不是任由 saveMutation 静默推导。
  const trimmedFromDomain = draft.fromDomain.trim();
  const matchedDomain = useMemo(
    () => verifiedDomains.find((d) => d.domain.toLowerCase() === trimmedFromDomain.toLowerCase()),
    [verifiedDomains, trimmedFromDomain],
  );
  const tenantDomainId = matchedDomain ? matchedDomain.id : null;

  // 编辑一条既有的 any-sender 授权（后端 tenant_domain_id 本就是 null）且用户没有在发信域名
  // 框里新填内容时，域名 gate 不适用：这类行的"任意发信域"是既定状态，不是本次编辑要新引入
  // 的语义，仅想切启停/垃圾过滤等其它字段时不应该被域名校验卡住无法保存（final review
  // finding 1 后半段）。用户一旦真的往框里填了域名，就退回正常域名 gate（视为把 any-sender
  // 收紧成具体域名，仍需解析到已验证域名）。新建永远不豁免。
  const isEditingAnySenderRule = editingRule != null && editingRule.tenant_domain_id === null;
  const skipDomainGate = isEditingAnySenderRule && trimmedFromDomain === '';

  const nameErr = !draft.ruleName.trim() ? t('fields.ruleNameRequired') : '';
  const priorityErr = draft.priority < 1 ? t('fields.priorityInvalid') : '';
  // GT-12329 review Important I11：后端 chk_mail_admission_has_source 要求
  // client_cidr 非空或 use_spf=true 二选一（纯粹的"来源不限"+"不用 SPF"授权任意
  // 来源，等价于无条件开放中继，后端拒绝）。emptyRelayRow() 的默认草稿恰好落在
  // 这个非法组合上（sourceIp='ALL' → client_cidr=''，useSpf=false），此前前端
  // hasError 完全没有对应校验，新建规则时只要不去动来源 IP/SPF 就必定保存 400，
  // 用户只能看通用 saveError 文案自己猜。这里镜像后端的二选一约束，直接给出可
  // 定位的红字提示。判定口径与 rowToRulePayload 的 client_cidr 归一化一致
  // （trim 后为空或大小写不敏感等于 'ALL' 都算"未填"）。
  //
  // 仅新建（editingId == null）时启用：finding 原文明确描述的是"新建规则默认
  // 必 400"，编辑既有行不在范围内——历史上确实存在 client_cidr 为空且
  // use_spf=false 的既有行（如 any-sender 兜底行，见下方
  // isEditingAnySenderRule/skipDomainGate 同一处理哲学），编辑这类行只是想切
  // 启停等无关字段时不该被这条新校验卡住，否则运营者连"停用一条历史遗留脏
  // 数据"都做不到（同 review Important I4 对后端 retired-page 的态度）。
  const trimmedSourceIp = draft.sourceIp.trim();
  const hasSourceCidr = trimmedSourceIp !== '' && trimmedSourceIp.toUpperCase() !== 'ALL';
  const sourceRequiredErr =
    editingId == null && !hasSourceCidr && !draft.useSpf ? t('fields.sourceRequired') : '';
  const spfDomainErr = draft.useSpf && !trimmedFromDomain ? t('fields.fromDomainRequiredWithSpf') : '';
  // SPF 路径下发信域名同样是授权判定源，其值也必须解析到已验证域名才放行保存——不给
  // SPF 开个后门绕过校验（宁可收紧，见 finding 原文）。spfDomainErr（域名为空）优先显示，
  // 避免同一输入框同时冒出两条红字。
  // domainsLoading 时不显示红字（避免已验证租户域名列表尚未到达就误报"未验证"）；但
  // hasError 仍要在 domainsLoading 期间保持阻断——宁可暂时不能保存，也不能在还没读到
  // 域名列表时就把 tenantDomainId 误判为 null 而放行（同一条"宁可收紧"底线）。handleSave
  // 命中这个分支时 toast 走的是通用 saveError 文案（没有域名列表还没到达专属的红字/toast），
  // 这个状态窗口极短（domains 查询通常先于用户完成输入前就已返回），不值得为此新增专属文案。
  // skipDomainGate 时两条判断都不适用——既不需要域名解析结果，也不需要等域名列表到达。
  const domainVerifyErr =
    !skipDomainGate && !spfDomainErr && !domainsLoading && tenantDomainId === null
      ? t('fields.fromDomainMustBeVerified')
      : '';

  // 收信域名 equals 校验（review Important）：后端 verifyRcptDomainOwnership
  // （internal/api/mail_admission.go）对 rcpt_match=equals 强制要求 rcpt_domain
  // 命中本租户已验证域或其子域——本页整体 system_admin-only，理论上恒满足
  // "非 equals 需要 system_admin" 那条闸门，但 equals 这条对任何角色都生效，前端
  // 必须有对应的呼应校验，否则用户只能撞 400 靠通用 toast 看后端英文消息。仅在
  // rcptMatchType==='equals' 且 rcptDomain 非空时才检查（该字段整体是可选项，
  // 留空/走 contains|regex 不受此约束）；子域匹配口径与后端 owned/`.`+owned 后缀
  // 判定对齐。domainsLoading 时不显示红字（同 domainVerifyErr 的守卫，避免已验证
  // 域名列表尚未到达就误报"未验证"），但仍需在 hasError 里保持阻断（宁可收紧）。
  const trimmedRcptDomain = draft.rcptDomain.trim();
  const rcptDomainOwned = useMemo(() => {
    const rcpt = trimmedRcptDomain.toLowerCase();
    return verifiedDomains.some((d) => {
      const owned = d.domain.toLowerCase();
      return rcpt === owned || rcpt.endsWith(`.${owned}`);
    });
  }, [verifiedDomains, trimmedRcptDomain]);
  const rcptEqualsNonEmpty = draft.rcptMatchType === 'equals' && trimmedRcptDomain !== '';
  const rcptDomainVerifyErr =
    rcptEqualsNonEmpty && !domainsLoading && !rcptDomainOwned ? t('fields.rcptDomainMustBeVerified') : '';

  const hasError = !!(
    nameErr ||
    priorityErr ||
    sourceRequiredErr ||
    spfDomainErr ||
    domainVerifyErr ||
    rcptDomainVerifyErr ||
    (!skipDomainGate && !spfDomainErr && domainsLoading) ||
    (rcptEqualsNonEmpty && domainsLoading)
  );

  const saveMutation = useMutation({
    mutationFn: async () => {
      const conceptual = rowToRulePayload(draft);
      const wireBody: RelayWirePayload = {
        ...conceptual,
        tenant_domain_id: tenantDomainId,
        // privileged 取「编辑前原值」与「本次语义强制」的并集，绝不因为编辑其它字段而静默
        // 降级一条既有的特权授权（review finding 1）：域名 FK 缺失或使用 SPF 仍然强制
        // privileged=true（真实后端要求，见文件顶部注释），但反过来——editingRule.privileged
        // 已经是 true 时，即便本次凑巧解析出了 tenantDomainId，也不会被这次保存悄悄改回
        // false。创建态 editingRule 为 null，公式退化为纯推导逻辑。
        privileged: (editingRule?.privileged ?? false) || tenantDomainId === null || draft.useSpf,
        // 编辑态：原样透传后端未在 UI 暴露的四个字段，避免 PUT 省略导致后端无条件清空
        // （review finding 2；创建态没有既有值可透传，维持后端默认）。helo_match 是
        // GT-12329 review Important I10 补入的第四个——本 UI 的 HELO 字段只有一个自由
        // 文本输入（无匹配方式选择器，见上方 draft.heloValue 的输入框），隐含意图恒是
        // "contains"；但一条历史上通过其它途径（旧版 UI/直接调 API）创建、helo_match=
        // equals/regex 的规则，此前编辑保存时 wireBody 会漏掉这个字段，PUT 请求体里
        // 完全不带 helo_match，后端据此把它悄悄退回默认 'contains'——等价于放宽了这条
        // 规则的 HELO 匹配严格度，且运营者对此毫无感知（表单没有任何一处显示或改动过
        // 这个值）。原样透传原值即可：本 UI 从不提供修改它的入口，保存动作不该改变它。
        ...(editingRule
          ? {
              rate_limit_per_hour: editingRule.rate_limit_per_hour,
              expires_at: editingRule.expires_at,
              allow_null_sender: editingRule.allow_null_sender,
              helo_match: editingRule.helo_match,
            }
          : {}),
      };
      if (editingId != null) {
        return updateMailAdmissionRule(editingId, wireBody, apiRequest);
      }
      return createMailAdmissionRule(wireBody, apiRequest);
    },
    onSuccess: () => {
      toast.success(editingId != null ? t('toasts.updated') : t('toasts.created'));
      closeDrawer();
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const handleSave = () => {
    if (hasError) {
      toast.error(t('toasts.saveError'));
      return;
    }
    saveMutation.mutate();
  };

  const deleteMutation = useMutation({
    mutationFn: (id: number) => deleteMailAdmissionRule(id, apiRequest),
    onSuccess: () => {
      toast.success(t('toasts.deleted'));
      setDeleteTarget(null);
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const runSimulate = () => {
    setSimResult(simulateRelay(rows, sim));
  };

  const simText = useMemo(() => {
    if (simResult === undefined) return null;
    if (simResult === null) return t('simulator.miss');
    return t('simulator.hit', {
      name: simResult.ruleName,
      filter: simResult.spamFilter ? t('simulator.filterYes') : t('simulator.filterNo'),
    });
  }, [simResult, t]);

  return (
    <div className="space-y-4 rounded-xl border border-border bg-card p-5" data-testid="mr-relay-root">
      <ListToolbar
        search={search}
        onSearchChange={setSearch}
        searchPlaceholder={t('searchPlaceholder')}
        onReset={resetFilters}
        filterCount={filterCount}
        filterContent={
          <>
            <div className="space-y-1">
              <span className="text-xs text-muted-foreground">{t('columns.sourceIp')}</span>
              <Input
                value={filters.sourceIp}
                onChange={(e) => setFilters((f) => ({ ...f, sourceIp: e.target.value }))}
                placeholder={t('filters.sourceIpPlaceholder')}
                className="h-9"
                data-testid="mr-relay-filter-source-ip"
              />
            </div>
            <div className="space-y-1">
              <span className="text-xs text-muted-foreground">{t('columns.fromDomain')}</span>
              <Input
                value={filters.fromDomain}
                onChange={(e) => setFilters((f) => ({ ...f, fromDomain: e.target.value }))}
                placeholder={t('filters.fromDomainPlaceholder')}
                className="h-9"
                data-testid="mr-relay-filter-from-domain"
              />
            </div>
            <div className="space-y-1">
              <span className="text-xs text-muted-foreground">{t('columns.rcptDomain')}</span>
              <Input
                value={filters.rcptDomain}
                onChange={(e) => setFilters((f) => ({ ...f, rcptDomain: e.target.value }))}
                placeholder={t('filters.rcptDomainPlaceholder')}
                className="h-9"
                data-testid="mr-relay-filter-rcpt-domain"
              />
            </div>
            <div className="space-y-1">
              <span className="text-xs text-muted-foreground">{t('columns.status')}</span>
              <Select
                value={filters.status}
                onValueChange={(v) => setFilters((f) => ({ ...f, status: v as Filters['status'] }))}
              >
                <SelectTrigger className="h-9" data-testid="mr-relay-filter-status">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t('filters.statusAll')}</SelectItem>
                  <SelectItem value="enabled">{t('filters.statusEnabled')}</SelectItem>
                  <SelectItem value="disabled">{t('filters.statusDisabled')}</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </>
        }
        actions={
          <Button size="sm" className="h-9 gap-1.5" onClick={openCreate} data-testid="mr-relay-create">
            <Plus className="h-4 w-4" />
            {ts('create')}
          </Button>
        }
        testIdPrefix="mr-relay"
      />

      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : filteredRows.length === 0 ? (
        <div data-testid="mr-relay-empty">
          <EmptyState
            title={ts('emptyText')}
            action={
              <Button variant="outline" size="sm" onClick={openCreate}>
                {ts('addNow')}
              </Button>
            }
          />
        </div>
      ) : (
        <Table data-testid="mr-relay-table">
          <TableHeader>
            <TableRow>
              <TableHead>{t('columns.priority')}</TableHead>
              <TableHead>{t('columns.sourceIp')}</TableHead>
              <TableHead>{t('columns.fromDomain')}</TableHead>
              <TableHead>{t('columns.helo')}</TableHead>
              <TableHead>{t('columns.rcptDomain')}</TableHead>
              <TableHead>{t('columns.spamFilter')}</TableHead>
              <TableHead>{t('columns.status')}</TableHead>
              <TableHead className="w-[200px]">{t('columns.actions')}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredRows.map((row) => (
              <TableRow key={row.id} data-testid={`mr-relay-row-${row.id}`}>
                <TableCell>{row.priority ?? '-'}</TableCell>
                <TableCell className="max-w-[160px]">
                  <div className="flex items-center gap-1.5">
                    <Tooltip>
                      <TooltipTrigger
                        render={<span className="block truncate">{row.sourceIp || 'ALL'}</span>}
                      />
                      <TooltipContent>{row.sourceIp || 'ALL'}</TooltipContent>
                    </Tooltip>
                    {row.useSpf && (
                      <Badge
                        variant="outline"
                        className="flex-shrink-0 border-blue-200 bg-blue-50 font-normal text-blue-600 dark:border-blue-900 dark:bg-blue-950 dark:text-blue-300"
                        data-testid={`mr-relay-spf-badge-${row.id}`}
                      >
                        SPF
                      </Badge>
                    )}
                  </div>
                </TableCell>
                <TableCell>{row.fromDomain || '-'}</TableCell>
                <TableCell>{row.heloValue || '-'}</TableCell>
                <TableCell>
                  {row.rcptDomain ? `(${t(RCPT_MATCH_LABEL_KEY[row.rcptMatchType])})${row.rcptDomain}` : '-'}
                </TableCell>
                <TableCell>
                  {row.spamFilter ? (
                    <Badge
                      variant="outline"
                      className="border-amber-200 bg-amber-50 font-normal text-amber-600 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-300"
                    >
                      {t('fields.spamFilterOn')}
                    </Badge>
                  ) : (
                    <span className="text-muted-foreground">{t('fields.spamFilterOff')}</span>
                  )}
                </TableCell>
                <TableCell>
                  {row.status === 'enabled' ? (
                    <Badge className="border-transparent bg-blue-600 font-normal text-white hover:bg-blue-600">
                      {t('filters.statusEnabled')}
                    </Badge>
                  ) : (
                    <Badge className="border-transparent bg-gray-100 font-normal text-gray-500 hover:bg-gray-100 dark:bg-gray-800 dark:text-gray-400">
                      {t('filters.statusDisabled')}
                    </Badge>
                  )}
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-0.5">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 gap-1 text-muted-foreground"
                      onClick={() => openEdit(row)}
                      data-testid={`mr-relay-sim-${row.id}`}
                    >
                      <FlaskConical className="h-3.5 w-3.5" />
                      {t('simulateButton')}
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 gap-1 text-blue-600"
                      onClick={() => openEdit(row)}
                      data-testid={`mr-relay-edit-${row.id}`}
                    >
                      <Pencil className="h-3.5 w-3.5" />
                      {t('editButton')}
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 gap-1 text-destructive"
                      onClick={() => setDeleteTarget(row)}
                      data-testid={`mr-relay-delete-${row.id}`}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      {t('deleteButton')}
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      <Sheet open={drawerOpen} onOpenChange={(open) => !open && closeDrawer()}>
        <SheetContent side="right" className="w-full sm:max-w-xl" data-testid="mr-relay-drawer">
          <SheetHeader>
            <SheetTitle>{editingId != null ? t('drawerTitleEdit') : t('drawerTitleNew')}</SheetTitle>
            <SheetDescription>{t('drawerDescription')}</SheetDescription>
          </SheetHeader>
          <div className="flex-1 space-y-4 overflow-y-auto px-4 py-4">
            <div className="space-y-3 rounded-lg border border-border p-4">
              <h4 className="text-sm font-medium">{t('sectionBasic')}</h4>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label>
                    {t('fields.ruleName')}
                    <span className="ml-0.5 text-destructive">*</span>
                  </Label>
                  <Input
                    value={draft.ruleName}
                    onChange={(e) => setDraft((d) => ({ ...d, ruleName: e.target.value }))}
                    data-testid="mr-relay-name-input"
                  />
                  {nameErr && (
                    <p className="text-xs text-destructive" data-testid="mr-relay-name-error">
                      {nameErr}
                    </p>
                  )}
                </div>
                <div className="space-y-1.5">
                  <Label>{t('fields.priority')}</Label>
                  <Input
                    type="number"
                    value={draft.priority}
                    onChange={(e) => setDraft((d) => ({ ...d, priority: Number(e.target.value) }))}
                    data-testid="mr-relay-priority-input"
                  />
                  <p className="text-xs text-muted-foreground">{t('fields.priorityHint')}</p>
                  {priorityErr && (
                    <p className="text-xs text-destructive" data-testid="mr-relay-priority-error">
                      {priorityErr}
                    </p>
                  )}
                </div>
              </div>
              <label className="flex items-center gap-2 text-sm">
                <Switch
                  checked={draft.status === 'enabled'}
                  onCheckedChange={(c) => setDraft((d) => ({ ...d, status: c ? 'enabled' : 'disabled' }))}
                  data-testid="mr-relay-active-switch"
                />
                {draft.status === 'enabled' ? t('fields.active') : t('fields.inactive')}
              </label>
            </div>

            <div className="space-y-3 rounded-lg border border-border p-4">
              <h4 className="text-sm font-medium">{t('sectionMatch')}</h4>
              <div className="flex items-center gap-2 rounded-md border border-blue-100 bg-blue-50/60 px-3 py-2 text-xs text-blue-700">
                <Info className="h-3.5 w-3.5 flex-shrink-0" />
                {t('matchInfoBanner')}
              </div>
              <div className="space-y-1.5">
                <Label>{t('fields.sourceIp')}</Label>
                <Input
                  value={draft.sourceIp}
                  onChange={(e) => setDraft((d) => ({ ...d, sourceIp: e.target.value }))}
                  placeholder={t('fields.sourceIpPlaceholder')}
                  data-testid="mr-relay-source-ip-input"
                />
                {draft.useSpf && <p className="text-xs text-muted-foreground">{t('fields.sourceIpSpfHint')}</p>}
                {sourceRequiredErr && (
                  <p className="text-xs text-destructive" data-testid="mr-relay-source-ip-error">
                    {sourceRequiredErr}
                  </p>
                )}
              </div>
              <div className="space-y-1.5">
                <Label>{t('fields.fromDomain')}</Label>
                <Input
                  value={draft.fromDomain}
                  onChange={(e) => setDraft((d) => ({ ...d, fromDomain: e.target.value }))}
                  placeholder={t('fields.fromDomainPlaceholder')}
                  data-testid="mr-relay-from-domain-input"
                />
                {(spfDomainErr || domainVerifyErr) && (
                  <p className="text-xs text-destructive" data-testid="mr-relay-from-domain-error">
                    {spfDomainErr || domainVerifyErr}
                  </p>
                )}
              </div>
              <div className="space-y-1.5">
                <Label>{t('fields.useSpfLabel')}</Label>
                <label className="flex cursor-pointer items-center gap-2 text-sm">
                  <Checkbox
                    checked={draft.useSpf}
                    onCheckedChange={(c) => setDraft((d) => ({ ...d, useSpf: !!c }))}
                    data-testid="mr-relay-spf-checkbox"
                  />
                  {t('fields.useSpf')}
                </label>
                <p className="text-xs text-muted-foreground">{t('fields.useSpfHint')}</p>
              </div>
              <div className="space-y-1.5">
                <Label>{t('fields.helo')}</Label>
                <Input
                  value={draft.heloValue}
                  onChange={(e) => setDraft((d) => ({ ...d, heloValue: e.target.value }))}
                  placeholder={t('fields.heloPlaceholder')}
                  data-testid="mr-relay-helo-input"
                />
              </div>
              <div className="space-y-1.5">
                <Label>{t('fields.rcptDomain')}</Label>
                <div className="flex gap-2">
                  <Select
                    value={draft.rcptMatchType}
                    onValueChange={(v) => setDraft((d) => ({ ...d, rcptMatchType: v as RcptMatchType }))}
                  >
                    <SelectTrigger className="w-28" data-testid="mr-relay-rcpt-match-select">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="contains">{t('fields.rcptMatchContains')}</SelectItem>
                      <SelectItem value="equals">{t('fields.rcptMatchEquals')}</SelectItem>
                      <SelectItem value="regex">{t('fields.rcptMatchRegex')}</SelectItem>
                    </SelectContent>
                  </Select>
                  <Input
                    className="flex-1"
                    value={draft.rcptDomain}
                    onChange={(e) => setDraft((d) => ({ ...d, rcptDomain: e.target.value }))}
                    placeholder={t('fields.rcptDomainPlaceholder')}
                    data-testid="mr-relay-rcpt-domain-input"
                  />
                </div>
                {rcptDomainVerifyErr && (
                  <p className="text-xs text-destructive" data-testid="mr-relay-rcpt-domain-error">
                    {rcptDomainVerifyErr}
                  </p>
                )}
              </div>
              <div className="space-y-1.5">
                <Label>{t('fields.spamFilter')}</Label>
                <Select
                  value={draft.spamFilter ? '1' : '0'}
                  onValueChange={(v) => setDraft((d) => ({ ...d, spamFilter: v === '1' }))}
                >
                  <SelectTrigger className="w-40" data-testid="mr-relay-spam-filter-select">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="0">{t('fields.spamFilterOff')}</SelectItem>
                    <SelectItem value="1">{t('fields.spamFilterOn')}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-3 rounded-lg border border-border p-4">
              <div>
                <h4 className="text-sm font-medium">{t('sectionSimulator')}</h4>
                <p className="mt-0.5 text-xs text-muted-foreground">{t('simulatorDesc')}</p>
              </div>
              <div className="grid grid-cols-3 gap-2">
                <Input
                  value={sim.sourceIp}
                  onChange={(e) => setSim((s) => ({ ...s, sourceIp: e.target.value }))}
                  placeholder={t('simulator.sourceIpPlaceholder')}
                  data-testid="mr-relay-sim-src"
                />
                <Input
                  value={sim.fromDomain}
                  onChange={(e) => setSim((s) => ({ ...s, fromDomain: e.target.value }))}
                  placeholder={t('simulator.fromDomainPlaceholder')}
                  data-testid="mr-relay-sim-from"
                />
                <Input
                  value={sim.rcptDomain}
                  onChange={(e) => setSim((s) => ({ ...s, rcptDomain: e.target.value }))}
                  placeholder={t('simulator.rcptDomainPlaceholder')}
                  data-testid="mr-relay-sim-rcpt"
                />
              </div>
              <Button
                variant="outline"
                size="sm"
                className="gap-1.5"
                onClick={runSimulate}
                data-testid="mr-relay-sim-run"
              >
                <FlaskConical className="h-3.5 w-3.5" />
                {t('simulator.runButton')}
              </Button>
              {simText && (
                <div
                  className="rounded-md border border-border bg-muted/40 px-3 py-2 text-xs text-foreground/80"
                  data-testid="mr-relay-sim-result"
                >
                  {simText}
                </div>
              )}
            </div>
          </div>
          <SheetFooter>
            <Button onClick={handleSave} disabled={saveMutation.isPending} data-testid="mr-relay-save">
              {saveMutation.isPending && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
              {tc('save')}
            </Button>
            <Button variant="outline" onClick={closeDrawer} data-testid="mr-relay-cancel">
              {tc('cancel')}
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>

      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent data-testid="mr-relay-delete-dialog">
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t('deleteDialogTitle', { name: deleteTarget?.ruleName ?? '' })}
            </AlertDialogTitle>
            <AlertDialogDescription>{t('deleteDialogDescription')}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{tc('cancel')}</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => deleteTarget && deleteMutation.mutate(deleteTarget.id)}
              data-testid="mr-relay-delete-confirm"
            >
              {t('deleteConfirmButton')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
