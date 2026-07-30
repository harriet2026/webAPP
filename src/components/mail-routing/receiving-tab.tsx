'use client';

// 收信域管理 Tab —— html_spec 对齐重构（design/implement/spec/2026-07-28-mail-routing-
// html-spec-alignment-design.md §4.1，doc/html-spec/admin-forwarding/index.html §2.3 +
// layer-1-receiving-drawer.html + layer-2-receiving-delete.html）。
//
// 从「卡片 + nexthop 子表」重构为 demo 的扁平表格形态：一域一行，目的地址/端口/状态聚合展示；
// 抽屉内以 TagInput 承载多目的地址 + 共享端口，不再单独暴露每个 nexthop 的
// type/priority/per-hop is_active（DEV-4，创建走默认值：type 按 isIPv4 推断、
// priority=数组序、is_active 恒 true）。

import { useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { Plus, Pencil, Trash2, Loader2, RefreshCw, ChevronLeft, ChevronRight } from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
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
import { ProbeBadge } from '@/components/mail-routing/shared/probe-badge';
import { TagInput } from '@/components/mail-routing/shared/tag-input';
import { TestResultTag } from '@/components/mail-routing/shared/test-result-tag';
import { isDomain, isHostOrIp, isIPv4, type ProbeStatus, type TestState } from '@/components/mail-routing/mr-types';
import { useScopedApiRequest, type ApiRequestFn } from '@/lib/api/client';
import { isMockEnabled } from '@/lib/mock/storage';
import { listTenantDomains, probeDomain } from '@/lib/api/mail-routing';
import {
  listNexthops,
  createNexthop,
  updateNexthop,
  deleteNexthop,
} from '@/lib/api/tenant-routing';
import { createTenantDomain, deleteTenantDomain, updateTenantDomain } from '@/lib/api/tenants';
import type { TenantDomain, TenantDomainNexthop } from '@/types/tenant';
import { formatDate } from '@/lib/utils';

interface ReceivingTabProps {
  tenantId: number;
}

interface ReceivingDomainRow {
  id: number;
  domainName: string;
  targetHosts: string[];
  targetPort: number;
  status: ProbeStatus;
  abnormalCount: number;
  total: number;
  lastProbeTime: string | null;
}

interface DraftState {
  domainName: string;
  targetHosts: string[];
  targetPort: number;
}

const EMPTY_DRAFT: DraftState = { domainName: '', targetHosts: [], targetPort: 25 };

interface Filters {
  target: string;
  port: string;
  status: 'all' | ProbeStatus;
}

const EMPTY_FILTERS: Filters = { target: '', port: '', status: 'all' };

const PAGE_SIZE = 20;

/** Compute per-domain aggregate probe status from its active nexthops. */
function aggregateProbeStatus(nexthops: TenantDomainNexthop[]): ProbeStatus {
  const active = nexthops.filter((nh) => nh.is_active);
  if (active.length === 0) return 'unchecked';
  const neverProbed = active.every((nh) => !nh.probe_status || nh.probe_status === 'unchecked');
  if (neverProbed) return 'unchecked';
  const normal = active.filter((nh) => nh.probe_status === 'normal').length;
  if (normal === active.length) return 'normal';
  if (normal === 0) return 'abnormal';
  return 'partial';
}

function latestProbeTime(active: TenantDomainNexthop[]): string | null {
  const times = active
    .filter((nh) => nh.last_probe_time)
    .map((nh) => new Date(nh.last_probe_time!).getTime());
  if (times.length === 0) return null;
  return new Date(Math.max(...times)).toISOString();
}

/** Target port shown in the row = the mode (most common port) among the
 * domain's active nexthops (spec §4.1: 所有 nexthop 共享同一端口, 众数兜底异常数据). */
function modePort(active: TenantDomainNexthop[]): number {
  if (active.length === 0) return 25;
  const counts = new Map<number, number>();
  active.forEach((nh) => counts.set(nh.port, (counts.get(nh.port) ?? 0) + 1));
  let best = active[0].port;
  let bestCount = 0;
  counts.forEach((count, port) => {
    if (count > bestCount) {
      bestCount = count;
      best = port;
    }
  });
  return best;
}

function toRow(domain: TenantDomain, nexthops: TenantDomainNexthop[], statusOverride?: ProbeStatus): ReceivingDomainRow {
  const active = [...nexthops]
    .filter((nh) => nh.is_active)
    .sort((a, b) => a.priority - b.priority || a.id - b.id);
  return {
    id: domain.id,
    domainName: domain.domain,
    targetHosts: active.map((nh) => nh.host),
    targetPort: modePort(active),
    status: statusOverride ?? aggregateProbeStatus(nexthops),
    abnormalCount: active.filter((nh) => nh.probe_status === 'abnormal').length,
    total: active.length,
    lastProbeTime: latestProbeTime(active),
  };
}

interface ConnectivityTestResult {
  success: boolean;
  message: string;
  latency_ms: number;
}

/** `/mail-routing/connectivity-test` is a mock-only virtual endpoint (spec A9 /
 * DEV-7) — no real backend route exists, so this is only ever called while
 * mock mode is on (the drawer button is disabled otherwise). */
function testConnectivity(request: ApiRequestFn): Promise<ConnectivityTestResult> {
  return request<ConnectivityTestResult>('/mail-routing/connectivity-test', { method: 'POST' });
}

export function ReceivingTab({ tenantId }: ReceivingTabProps) {
  const t = useTranslations('mailRouting');
  const ts = useTranslations('mailRouting.shared');
  const tc = useTranslations('common');
  const { apiRequest } = useScopedApiRequest(tenantId);
  const queryClient = useQueryClient();
  const mockOn = isMockEnabled();

  const { data: domains = [], isLoading: domainsLoading } = useQuery({
    queryKey: ['mail-routing-domains', tenantId],
    queryFn: () => listTenantDomains(tenantId, apiRequest),
  });

  const domainIdsKey = domains.map((d) => d.id).join(',');
  const { data: nexthopsByDomain = {}, isLoading: nexthopsLoading } = useQuery({
    queryKey: ['mail-routing-domains-nexthops', tenantId, domainIdsKey],
    queryFn: async () => {
      const entries = await Promise.all(
        domains.map(async (d) => [d.id, await listNexthops(tenantId, d.id, apiRequest)] as const)
      );
      return Object.fromEntries(entries) as Record<number, TenantDomainNexthop[]>;
    },
    enabled: domains.length > 0,
  });

  // Server-computed aggregate probe status per domain, captured from the
  // probe response — authoritative until the next background refetch lands.
  const [serverStatusByDomain, setServerStatusByDomain] = useState<Record<number, ProbeStatus>>({});
  const [probingId, setProbingId] = useState<number | null>(null);

  const [search, setSearch] = useState('');
  const [filters, setFilters] = useState<Filters>({ ...EMPTY_FILTERS });
  const [page, setPage] = useState(1);

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [draft, setDraft] = useState<DraftState>({ ...EMPTY_DRAFT });
  const [testState, setTestState] = useState<TestState>('idle');
  const [deleteTarget, setDeleteTarget] = useState<TenantDomain | null>(null);

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['mail-routing-domains', tenantId] });
    queryClient.invalidateQueries({ queryKey: ['mail-routing-domains-nexthops', tenantId] });
  };

  const rows: ReceivingDomainRow[] = useMemo(
    () => domains.map((d) => toRow(d, nexthopsByDomain[d.id] ?? [], serverStatusByDomain[d.id])),
    [domains, nexthopsByDomain, serverStatusByDomain]
  );

  const filteredRows = useMemo(() => {
    const kw = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (
        kw &&
        !r.domainName.toLowerCase().includes(kw) &&
        !r.targetHosts.some((h) => h.toLowerCase().includes(kw))
      ) {
        return false;
      }
      if (filters.target && !r.targetHosts.some((h) => h.includes(filters.target))) return false;
      if (filters.port && String(r.targetPort) !== filters.port.trim()) return false;
      if (filters.status !== 'all' && r.status !== filters.status) return false;
      return true;
    });
  }, [rows, search, filters]);

  const filterCount =
    (filters.target ? 1 : 0) + (filters.port ? 1 : 0) + (filters.status !== 'all' ? 1 : 0);
  const totalPages = Math.max(1, Math.ceil(filteredRows.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const pagedRows = filteredRows.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  const resetFilters = () => {
    setSearch('');
    setFilters({ ...EMPTY_FILTERS });
    setPage(1);
  };

  const closeDrawer = () => {
    setDrawerOpen(false);
    setEditingId(null);
    setDraft({ ...EMPTY_DRAFT });
    setTestState('idle');
  };

  const openCreate = () => {
    setDraft({ ...EMPTY_DRAFT });
    setEditingId(null);
    setTestState('idle');
    setDrawerOpen(true);
  };

  const openEdit = (row: ReceivingDomainRow) => {
    setDraft({ domainName: row.domainName, targetHosts: [...row.targetHosts], targetPort: row.targetPort });
    setEditingId(row.id);
    setTestState('idle');
    setDrawerOpen(true);
  };

  const probeMutation = useMutation({
    mutationFn: (domainId: number) => probeDomain(tenantId, domainId, apiRequest),
    onMutate: (domainId) => setProbingId(domainId),
    onSettled: () => setProbingId(null),
    onSuccess: (data, domainId) => {
      setServerStatusByDomain((prev) => ({ ...prev, [domainId]: data.probe_status }));
      toast.success(t('receiving.probeCompleteToast'));
      invalidate();
    },
    onError: (e: Error) => toast.error(t('receiving.probeFailed') + ': ' + e.message),
  });

  const createMutation = useMutation({
    mutationFn: async (payload: DraftState) => {
      const domain = await createTenantDomain(
        tenantId,
        { domain: payload.domainName, next_hop_type: 'domain', next_hop_host: '', next_hop_port: 0 },
        apiRequest
      );
      await Promise.all(
        payload.targetHosts.map((host, idx) =>
          createNexthop(
            tenantId,
            domain.id,
            {
              host,
              port: payload.targetPort,
              next_hop_type: isIPv4(host) ? 'ip' : 'domain',
              priority: idx,
              is_active: true,
            },
            apiRequest
          )
        )
      );
      return domain;
    },
    onSuccess: () => {
      toast.success(t('receiving.createdToast'));
      closeDrawer();
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const updateMutation = useMutation({
    mutationFn: async ({
      domain,
      existingNexthops,
      payload,
    }: {
      domain: TenantDomain;
      existingNexthops: TenantDomainNexthop[];
      payload: DraftState;
    }) => {
      if (payload.domainName !== domain.domain) {
        // Task 9 修复：updateTenantDomain 此前没有 requestFn 形参，硬编码走 @/lib/api/client
        // 的模块级 apiRequest，而不是本组件从 useScopedApiRequest() 拿到的作用域版本——与同文件
        // 的 createTenantDomain/deleteTenantDomain（均可注入 requestFn）不一致。功能上因为
        // tenantHeader(tenantId) 本身会补上 X-Tenant-ID，生产环境两者表现一致，但破坏了可测试性
        // （测试里 mock 的是 useScopedApiRequest 返回的 apiRequest，模块级 apiRequest 不受其影响，
        // 补覆盖率单测时才发现）。已给 updateTenantDomain 加 requestFn 形参并在此处显式传入。
        await updateTenantDomain(domain.id, { domain: payload.domainName }, tenantId, apiRequest);
      }

      // Nexthop delta (DEV-4): the drawer only manages active nexthops as a
      // flat host list — per-hop type/priority/active are never surfaced, so
      // they're recomputed here (type by isIPv4, priority by array order,
      // active always true). Existing hosts are updated in place (keeps their
      // id / probe history); new hosts are created; hosts no longer present
      // are deleted. Inactive nexthops (outside this UI's reach) are left
      // untouched.
      const activeExisting = existingNexthops.filter((nh) => nh.is_active);
      const existingByHost = new Map(activeExisting.map((nh) => [nh.host, nh]));
      const keepHosts = new Set(payload.targetHosts);

      await Promise.all(
        payload.targetHosts.map((host, idx) => {
          const nextHopType = isIPv4(host) ? 'ip' : 'domain';
          const existing = existingByHost.get(host);
          if (existing) {
            return updateNexthop(
              tenantId,
              domain.id,
              existing.id,
              { host, port: payload.targetPort, next_hop_type: nextHopType, priority: idx, is_active: true },
              apiRequest
            );
          }
          return createNexthop(
            tenantId,
            domain.id,
            { host, port: payload.targetPort, next_hop_type: nextHopType, priority: idx, is_active: true },
            apiRequest
          );
        })
      );

      await Promise.all(
        activeExisting
          .filter((nh) => !keepHosts.has(nh.host))
          .map((nh) => deleteNexthop(tenantId, domain.id, nh.id, apiRequest))
      );
    },
    onSuccess: () => {
      toast.success(t('receiving.updatedToast'));
      closeDrawer();
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteMutation = useMutation({
    mutationFn: (domain: TenantDomain) => deleteTenantDomain(domain.id, tenantId, apiRequest),
    onSuccess: () => {
      toast.success(t('receiving.deletedToast'));
      setDeleteTarget(null);
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const domainNameTrimmed = draft.domainName.trim();
  const nameErr = !domainNameTrimmed
    ? t('receiving.domainNameRequired')
    : !isDomain(domainNameTrimmed)
      ? t('receiving.domainNameInvalid')
      : rows.some((r) => r.id !== editingId && r.domainName.toLowerCase() === domainNameTrimmed.toLowerCase())
        ? t('receiving.domainNameDuplicate')
        : '';
  const hostErr = draft.targetHosts.length === 0 ? t('receiving.targetHostsRequired') : '';
  const portErr = draft.targetPort < 1 || draft.targetPort > 65535 ? t('receiving.targetPortRequired') : '';
  const hasError = !!(nameErr || hostErr || portErr);
  const saving = createMutation.isPending || updateMutation.isPending;

  const handleSave = () => {
    if (hasError) {
      toast.error(t('receiving.saveErrorToast'));
      return;
    }
    const payload: DraftState = {
      domainName: domainNameTrimmed,
      targetHosts: draft.targetHosts,
      targetPort: draft.targetPort,
    };
    if (editingId != null) {
      const domain = domains.find((d) => d.id === editingId);
      if (!domain) return;
      updateMutation.mutate({ domain, existingNexthops: nexthopsByDomain[editingId] ?? [], payload });
    } else {
      createMutation.mutate(payload);
    }
  };

  const runConnectivityTest = async () => {
    if (!mockOn) return;
    setTestState('loading');
    try {
      const [result] = await Promise.all([
        testConnectivity(apiRequest),
        new Promise((resolve) => setTimeout(resolve, 900)),
      ]);
      setTestState(result.success ? 'ok' : 'fail');
    } catch {
      setTestState('fail');
    }
  };

  const loading = domainsLoading || (domains.length > 0 && nexthopsLoading);

  return (
    <div className="space-y-4 rounded-xl border border-border bg-card p-5" data-testid="mr-recv-root">
      <ListToolbar
        search={search}
        onSearchChange={(v) => {
          setSearch(v);
          setPage(1);
        }}
        searchPlaceholder={t('receiving.searchPlaceholder')}
        onReset={resetFilters}
        filterCount={filterCount}
        filterContent={
          <>
            <div className="space-y-1">
              <span className="text-xs text-muted-foreground">{t('receiving.hostsColumn')}</span>
              <Input
                value={filters.target}
                onChange={(e) => {
                  setFilters((f) => ({ ...f, target: e.target.value }));
                  setPage(1);
                }}
                placeholder={t('receiving.filterTargetPlaceholder')}
                className="h-9"
                data-testid="mr-recv-filter-target"
              />
            </div>
            <div className="space-y-1">
              <span className="text-xs text-muted-foreground">{t('receiving.portColumn')}</span>
              <Input
                value={filters.port}
                onChange={(e) => {
                  setFilters((f) => ({ ...f, port: e.target.value }));
                  setPage(1);
                }}
                placeholder={t('receiving.filterPortPlaceholder')}
                className="h-9"
                data-testid="mr-recv-filter-port"
              />
            </div>
            <div className="space-y-1">
              <span className="text-xs text-muted-foreground">{t('receiving.statusColumn')}</span>
              <Select
                value={filters.status}
                onValueChange={(v) => {
                  setFilters((f) => ({ ...f, status: v as Filters['status'] }));
                  setPage(1);
                }}
              >
                <SelectTrigger className="h-9" data-testid="mr-recv-filter-status">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t('receiving.filterStatusAll')}</SelectItem>
                  <SelectItem value="normal">{ts('probe.normal')}</SelectItem>
                  <SelectItem value="abnormal">{ts('probe.abnormal')}</SelectItem>
                  <SelectItem value="partial">{ts('probe.partial')}</SelectItem>
                  <SelectItem value="unchecked">{ts('probe.unchecked')}</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </>
        }
        actions={
          <Button size="sm" className="h-9 gap-1.5" onClick={openCreate} data-testid="mr-recv-create">
            <Plus className="h-4 w-4" />
            {ts('create')}
          </Button>
        }
        testIdPrefix="mr-recv"
      />

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : filteredRows.length === 0 ? (
        <div data-testid="mr-recv-empty">
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
        <>
          <Table data-testid="mr-recv-table">
            <TableHeader>
              <TableRow>
                <TableHead>{t('receiving.domainColumn')}</TableHead>
                <TableHead>{t('receiving.hostsColumn')}</TableHead>
                <TableHead>{t('receiving.portColumn')}</TableHead>
                <TableHead>{t('receiving.statusColumn')}</TableHead>
                <TableHead>{t('receiving.lastProbeColumn')}</TableHead>
                <TableHead className="w-[180px]">{t('receiving.actionsColumn')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {pagedRows.map((row) => (
                <TableRow key={row.id} data-testid={`mr-recv-row-${row.id}`}>
                  <TableCell className="font-medium">{row.domainName}</TableCell>
                  <TableCell className="max-w-[280px]">
                    <Tooltip>
                      <TooltipTrigger
                        render={
                          <span className="block truncate text-muted-foreground">
                            {row.targetHosts.join('、')}
                          </span>
                        }
                      />
                      <TooltipContent>{row.targetHosts.join('、')}</TooltipContent>
                    </Tooltip>
                  </TableCell>
                  <TableCell>{row.targetPort}</TableCell>
                  <TableCell>
                    {probingId === row.id ? (
                      <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        {t('receiving.probing')}
                      </span>
                    ) : (
                      <ProbeBadge
                        status={row.status}
                        abnormalCount={row.abnormalCount}
                        total={row.total}
                        testId={`mr-recv-status-${row.id}`}
                      />
                    )}
                  </TableCell>
                  <TableCell className="text-muted-foreground">{formatDate(row.lastProbeTime)}</TableCell>
                  <TableCell>
                    <div className="flex items-center gap-0.5">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 gap-1 text-muted-foreground"
                        disabled={probingId === row.id}
                        onClick={() => probeMutation.mutate(row.id)}
                        data-testid={`mr-recv-probe-${row.id}`}
                      >
                        <RefreshCw className="h-3.5 w-3.5" />
                        {t('receiving.probeButton')}
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 gap-1 text-blue-600"
                        onClick={() => openEdit(row)}
                        data-testid={`mr-recv-edit-${row.id}`}
                      >
                        <Pencil className="h-3.5 w-3.5" />
                        {t('receiving.editButton')}
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 gap-1 text-destructive"
                        onClick={() => {
                          const domain = domains.find((d) => d.id === row.id);
                          if (domain) setDeleteTarget(domain);
                        }}
                        data-testid={`mr-recv-delete-${row.id}`}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                        {t('receiving.deleteButton')}
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <div className="flex flex-wrap items-center justify-between gap-3 pt-3 text-sm text-muted-foreground">
            <span>{tc('total', { count: filteredRows.length })}</span>
            {totalPages > 1 && (
              <div className="flex items-center gap-1.5">
                <Button
                  variant="outline"
                  size="icon"
                  className="h-8 w-8"
                  disabled={currentPage <= 1}
                  onClick={() => setPage(currentPage - 1)}
                  aria-label={tc('previous')}
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <span className="px-2 text-xs">
                  {currentPage} / {totalPages}
                </span>
                <Button
                  variant="outline"
                  size="icon"
                  className="h-8 w-8"
                  disabled={currentPage >= totalPages}
                  onClick={() => setPage(currentPage + 1)}
                  aria-label={tc('next')}
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            )}
          </div>
        </>
      )}

      <Sheet open={drawerOpen} onOpenChange={(open) => !open && closeDrawer()}>
        <SheetContent side="right" className="w-full sm:max-w-xl" data-testid="mr-recv-drawer">
          <SheetHeader>
            <SheetTitle>{editingId != null ? t('receiving.drawerTitleEdit') : t('receiving.drawerTitleNew')}</SheetTitle>
            <SheetDescription>{t('receiving.drawerDescription')}</SheetDescription>
          </SheetHeader>
          <div className="flex-1 space-y-4 overflow-y-auto px-4 py-4">
            <div className="space-y-3 rounded-lg border border-border p-4">
              <h4 className="text-sm font-medium">{t('receiving.sectionBasic')}</h4>
              <div className="space-y-1.5">
                <Label>
                  {t('receiving.domainNameLabel')}
                  <span className="ml-0.5 text-destructive">*</span>
                </Label>
                <Input
                  value={draft.domainName}
                  onChange={(e) => setDraft((d) => ({ ...d, domainName: e.target.value }))}
                  placeholder={t('receiving.domainNamePlaceholder')}
                  data-testid="mr-recv-domain-input"
                />
                {nameErr && (
                  <p className="text-xs text-destructive" data-testid="mr-recv-domain-error">
                    {nameErr}
                  </p>
                )}
              </div>
              <div className="space-y-1.5">
                <Label>
                  {t('receiving.hostsColumn')}
                  <span className="ml-0.5 text-destructive">*</span>
                </Label>
                <TagInput
                  value={draft.targetHosts}
                  onChange={(v) => setDraft((d) => ({ ...d, targetHosts: v }))}
                  placeholder={t('receiving.targetHostsPlaceholder')}
                  validate={isHostOrIp}
                  invalidHint={ts('invalidHostOrIp')}
                  testIdPrefix="mr-recv-tag"
                />
                {!hostErr && <p className="text-xs text-muted-foreground">{t('receiving.targetHostsHint')}</p>}
                {hostErr && (
                  <p className="text-xs text-destructive" data-testid="mr-recv-hosts-error">
                    {hostErr}
                  </p>
                )}
              </div>
              <div className="grid grid-cols-2 items-end gap-4">
                <div className="space-y-1.5">
                  <Label>
                    {t('receiving.portColumn')}
                    <span className="ml-0.5 text-destructive">*</span>
                  </Label>
                  <Input
                    type="number"
                    min={1}
                    max={65535}
                    value={draft.targetPort}
                    onChange={(e) => setDraft((d) => ({ ...d, targetPort: Number(e.target.value) }))}
                    data-testid="mr-recv-port-input"
                  />
                  {portErr && (
                    <p className="text-xs text-destructive" data-testid="mr-recv-port-error">
                      {portErr}
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-2 pb-0.5">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={draft.targetHosts.length === 0 || testState === 'loading' || !mockOn}
                    title={!mockOn ? t('receiving.testRealModeHint') : undefined}
                    onClick={runConnectivityTest}
                    data-testid="mr-recv-test-btn"
                  >
                    {t('receiving.testConnectivity')}
                  </Button>
                  <TestResultTag state={testState} testId="mr-recv-test-result" />
                </div>
              </div>
            </div>
          </div>
          <SheetFooter>
            <Button onClick={handleSave} disabled={saving} data-testid="mr-recv-save">
              {saving && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
              {tc('save')}
            </Button>
            <Button variant="outline" onClick={closeDrawer} data-testid="mr-recv-cancel">
              {tc('cancel')}
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>

      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent data-testid="mr-recv-delete-dialog">
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t('receiving.deleteDialogTitle', { domain: deleteTarget?.domain ?? '' })}
            </AlertDialogTitle>
            <AlertDialogDescription>{t('receiving.deleteDialogDescription')}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{tc('cancel')}</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => deleteTarget && deleteMutation.mutate(deleteTarget)}
              data-testid="mr-recv-delete-confirm"
            >
              {t('receiving.deleteConfirmButton')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
