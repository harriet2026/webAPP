'use client';

// 出站路由步骤一：代理 IP 列表（Task 13 接通真实后端 —— proxysvr-endpoints，取代 mock-only 虚拟
// endpoint）。对齐 doc/html-spec/admin-forwarding/index.html §2.5 c-5「交互层级 0」+
// layer-5-outbound-proxy-drawer.html（抽屉 5a + 删除确认 5b）、doc/mail-routing.md §4。
//
// 真实后端字段比 demo 多三个（lid/presend_code/license，私有协议交换点账户信息）：lid 必填，
// presend_code 默认 347，license 明文写入/密文存储，update 留空=保持原值不变（proxysvr.go 注释）。
// 行内「探测」按钮现在打真实 `POST /proxysvr-endpoints/:id/probe`（TCP/TLS 握手，≤5s），服务端
// 回写 probe_status/last_probe_time；不再是纯客户端 Math.random() 模拟。

import { useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { Plus, Pencil, Trash2, RefreshCw, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
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
import { AlertTriangle } from 'lucide-react';
import { EmptyState } from '@/components/shared/empty-state';
import { ListToolbar } from '@/components/mail-routing/shared/list-toolbar';
import { ProbeBadge } from '@/components/mail-routing/shared/probe-badge';
import { TestResultTag } from '@/components/mail-routing/shared/test-result-tag';
import { isIPv4, isDomain, SYSTEM_DEFAULT_HELO, type TestState } from '@/components/mail-routing/mr-types';
import { useScopedApiRequest } from '@/lib/api/client';
import {
  listProxysvrEndpoints,
  createProxysvrEndpoint,
  updateProxysvrEndpoint,
  deleteProxysvrEndpoint,
  probeProxysvrEndpoint,
} from '@/lib/api/proxysvr';
import { proxysvrEndpointToRow, emptyProxyDraft, proxyDraftToRequest, type OutboundProxyDraft } from './proxy-mapping';
import type { OutboundProxyRow, TlsMinVersion, CipherProfile } from './outbound-types';

// mock PTR 固定值——rDNS 一致性检查用的假反解结果（真实后端也没有 PTR 查询 API，demo 语义
// 沿用：出口 IP 的反向解析恒为该值）。
const MOCK_PTR_HOSTNAME = 'ptr-isp.example.com';

interface ProxyStepProps {
  tenantId: number;
}

interface Filters {
  proxyIp: string;
  egressIp: string;
  helo: string;
  status: 'all' | 'enabled' | 'disabled';
}
const EMPTY_FILTERS: Filters = { proxyIp: '', egressIp: '', helo: '', status: 'all' };

const TLS_MIN_VERSIONS: TlsMinVersion[] = ['1.0', '1.1', '1.2', '1.3'];

export function ProxyStep({ tenantId }: ProxyStepProps) {
  const t = useTranslations('mailRouting.outbound.proxy');
  const ts = useTranslations('mailRouting.shared');
  const tc = useTranslations('common');
  const { apiRequest } = useScopedApiRequest(tenantId);
  const queryClient = useQueryClient();

  const queryKey = ['proxysvr-endpoints', tenantId];
  const { data: endpoints = [], isLoading } = useQuery({
    queryKey,
    queryFn: () => listProxysvrEndpoints(apiRequest),
  });
  const rows = useMemo(() => endpoints.map(proxysvrEndpointToRow), [endpoints]);

  const [search, setSearch] = useState('');
  const [filters, setFilters] = useState<Filters>({ ...EMPTY_FILTERS });
  const [probingId, setProbingId] = useState<string | null>(null);

  const filteredRows = useMemo(() => {
    const kw = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (kw && !r.name.toLowerCase().includes(kw)) return false;
      if (filters.proxyIp && !r.proxyIp.includes(filters.proxyIp)) return false;
      if (filters.egressIp && !r.egressIp.includes(filters.egressIp)) return false;
      if (filters.helo && !r.heloHostname.toLowerCase().includes(filters.helo.toLowerCase())) return false;
      if (filters.status !== 'all' && r.status !== filters.status) return false;
      return true;
    });
  }, [rows, search, filters]);

  const filterCount =
    (filters.proxyIp ? 1 : 0) +
    (filters.egressIp ? 1 : 0) +
    (filters.helo ? 1 : 0) +
    (filters.status !== 'all' ? 1 : 0);
  const resetFilters = () => {
    setSearch('');
    setFilters({ ...EMPTY_FILTERS });
  };

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  // 编辑态是否已配置 license（服务端派生，明文/密文永不下发）——只用于抽屉的提示文案，
  // 不参与保存 payload（license 留空即保持原值不变）。
  const [editingLicensePresent, setEditingLicensePresent] = useState(false);
  const [draft, setDraft] = useState<OutboundProxyDraft>(emptyProxyDraft());
  const [deleteTarget, setDeleteTarget] = useState<OutboundProxyRow | null>(null);
  const [testState, setTestState] = useState<TestState>('idle');

  const invalidate = () => queryClient.invalidateQueries({ queryKey });

  const openCreate = () => {
    setDraft(emptyProxyDraft());
    setEditingId(null);
    setEditingLicensePresent(false);
    setTestState('idle');
    setDrawerOpen(true);
  };

  const openEdit = (row: OutboundProxyRow) => {
    setDraft({
      id: row.id,
      name: row.name,
      proxyIp: row.proxyIp,
      proxyPort: row.proxyPort,
      presendCode: row.presendCode,
      lid: row.lid,
      license: '',
      useTls: row.useTls,
      egressIp: row.egressIp,
      heloHostname: row.heloHostname,
      tlsMinVersion: row.tlsMinVersion,
      cipherProfile: row.cipherProfile,
      status: row.status,
    });
    setEditingId(row.id);
    setEditingLicensePresent(row.licensePresent);
    setTestState('idle');
    setDrawerOpen(true);
  };

  const closeDrawer = () => {
    setDrawerOpen(false);
    setEditingId(null);
  };

  const nameTrimmed = draft.name.trim();
  const nameErr = !nameTrimmed
    ? t('fields.nameRequired')
    : nameTrimmed.length < 2 || nameTrimmed.length > 50
      ? t('fields.nameLength')
      : rows.some((r) => r.id !== editingId && r.name === nameTrimmed)
        ? t('fields.nameDuplicate')
        : '';
  const proxyIpErr = !isIPv4(draft.proxyIp) ? t('fields.proxyIpInvalid') : '';
  const proxyPortErr =
    !Number.isInteger(draft.proxyPort) || draft.proxyPort < 1 || draft.proxyPort > 65535
      ? t('fields.proxyPortInvalid')
      : '';
  const lidErr = !draft.lid.trim() ? t('fields.lidRequired') : '';
  const egressIpTrimmed = draft.egressIp.trim();
  const egressIpErr = egressIpTrimmed !== '' && !isIPv4(egressIpTrimmed) ? t('fields.egressIpInvalid') : '';
  const heloTrimmed = draft.heloHostname.trim();
  const heloErr = heloTrimmed !== '' && !isDomain(heloTrimmed) ? t('fields.heloInvalid') : '';
  const showRdnsWarning = heloTrimmed !== '' && !heloErr && heloTrimmed !== MOCK_PTR_HOSTNAME;
  const hasError = !!(nameErr || proxyIpErr || proxyPortErr || lidErr || egressIpErr || heloErr);

  const saveMutation = useMutation({
    mutationFn: () => {
      const body = proxyDraftToRequest({ ...draft, name: nameTrimmed, lid: draft.lid.trim(), heloHostname: heloTrimmed });
      return editingId != null
        ? updateProxysvrEndpoint(Number(editingId), body, apiRequest)
        : createProxysvrEndpoint(body, apiRequest);
    },
    onSuccess: () => {
      if (heloTrimmed === SYSTEM_DEFAULT_HELO) {
        toast.success(t('toasts.heloSystemDefault'));
      } else {
        toast.success(editingId != null ? t('toasts.updated') : t('toasts.created'));
      }
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
    mutationFn: (id: string) => deleteProxysvrEndpoint(Number(id), apiRequest),
    onSuccess: () => {
      toast.success(t('toasts.deleted'));
      setDeleteTarget(null);
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  // 行内「探测」：真实 TCP/TLS 探测（≤5s），服务端回写 probe_status/last_probe_time。
  const probeMutation = useMutation({
    mutationFn: (id: string) => probeProxysvrEndpoint(Number(id), apiRequest),
    onMutate: (id: string) => setProbingId(id),
    onSuccess: () => {
      toast.success(t('toasts.probeComplete'));
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
    onSettled: () => setProbingId(null),
  });

  const runTest = async () => {
    setTestState('loading');
    try {
      const result = await probeProxysvrEndpoint(Number(editingId), apiRequest);
      setTestState(result.probe_status === 'normal' ? 'ok' : 'fail');
      invalidate();
    } catch {
      setTestState('fail');
    }
  };

  return (
    <div className="space-y-4" data-testid="mr-ob-proxy-root">
      <ListToolbar
        search={search}
        onSearchChange={setSearch}
        searchPlaceholder={t('searchPlaceholder')}
        onReset={resetFilters}
        filterCount={filterCount}
        filterContent={
          <>
            <div className="space-y-1">
              <span className="text-xs text-muted-foreground">{t('fields.proxyIp')}</span>
              <Input
                value={filters.proxyIp}
                onChange={(e) => setFilters((f) => ({ ...f, proxyIp: e.target.value }))}
                className="h-9"
                data-testid="mr-ob-proxy-filter-proxy-ip"
              />
            </div>
            <div className="space-y-1">
              <span className="text-xs text-muted-foreground">{t('fields.egressIp')}</span>
              <Input
                value={filters.egressIp}
                onChange={(e) => setFilters((f) => ({ ...f, egressIp: e.target.value }))}
                className="h-9"
                data-testid="mr-ob-proxy-filter-egress-ip"
              />
            </div>
            <div className="space-y-1">
              <span className="text-xs text-muted-foreground">{t('fields.helo')}</span>
              <Input
                value={filters.helo}
                onChange={(e) => setFilters((f) => ({ ...f, helo: e.target.value }))}
                className="h-9"
                data-testid="mr-ob-proxy-filter-helo"
              />
            </div>
            <div className="space-y-1">
              <span className="text-xs text-muted-foreground">{t('columns.status')}</span>
              <Select
                value={filters.status}
                onValueChange={(v) => setFilters((f) => ({ ...f, status: v as Filters['status'] }))}
              >
                <SelectTrigger className="h-9" data-testid="mr-ob-proxy-filter-status">
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
          <Button size="sm" className="h-9 gap-1.5" onClick={openCreate} data-testid="mr-ob-proxy-create">
            <Plus className="h-4 w-4" />
            {ts('create')}
          </Button>
        }
        testIdPrefix="mr-ob-proxy"
      />

      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : filteredRows.length === 0 ? (
        <div data-testid="mr-ob-proxy-empty">
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
          <Table data-testid="mr-ob-proxy-table">
            <TableHeader>
              <TableRow>
                <TableHead>{t('columns.id')}</TableHead>
                <TableHead>{t('columns.name')}</TableHead>
                <TableHead>{t('columns.proxyIp')}</TableHead>
                <TableHead>{t('columns.proxyPort')}</TableHead>
                <TableHead>{t('columns.egressIp')}</TableHead>
                <TableHead>{t('columns.helo')}</TableHead>
                <TableHead>{t('columns.tlsMinVersion')}</TableHead>
                <TableHead>{t('columns.status')}</TableHead>
                <TableHead className="w-[180px]">{t('columns.actions')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredRows.map((row) => (
                <TableRow key={row.id} data-testid={`mr-ob-proxy-row-${row.id}`}>
                  <TableCell className="text-muted-foreground">{row.id}</TableCell>
                  <TableCell className="font-medium">{row.name}</TableCell>
                  <TableCell>{row.proxyIp}</TableCell>
                  <TableCell>{row.proxyPort}</TableCell>
                  <TableCell>{row.egressIp}</TableCell>
                  <TableCell>
                    {row.heloHostname ? (
                      row.heloHostname
                    ) : (
                      <Tooltip>
                        <TooltipTrigger render={<span className="text-gray-400">{t('systemDefaultHelo')}</span>} />
                        <TooltipContent>{SYSTEM_DEFAULT_HELO}</TooltipContent>
                      </Tooltip>
                    )}
                  </TableCell>
                  <TableCell>{row.tlsMinVersion}</TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1.5">
                      {row.status === 'enabled' ? (
                        <Badge className="border-transparent bg-blue-600 font-normal text-white hover:bg-blue-600">
                          {t('filters.statusEnabled')}
                        </Badge>
                      ) : (
                        <Badge className="border-transparent bg-gray-100 font-normal text-gray-500 hover:bg-gray-100 dark:bg-gray-800 dark:text-gray-400">
                          {t('filters.statusDisabled')}
                        </Badge>
                      )}
                      <ProbeBadge status={row.probeStatus} testId={`mr-ob-proxy-status-${row.id}`} />
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-0.5">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 gap-1 text-gray-600"
                        disabled={probingId === row.id}
                        onClick={() => probeMutation.mutate(row.id)}
                        data-testid={`mr-ob-proxy-probe-${row.id}`}
                      >
                        {probingId === row.id ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <RefreshCw className="h-3.5 w-3.5" />
                        )}
                        {t('probeButton')}
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 gap-1 text-blue-600"
                        onClick={() => openEdit(row)}
                        data-testid={`mr-ob-proxy-edit-${row.id}`}
                      >
                        <Pencil className="h-3.5 w-3.5" />
                        {t('editButton')}
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 gap-1 text-red-600"
                        onClick={() => setDeleteTarget(row)}
                        data-testid={`mr-ob-proxy-delete-${row.id}`}
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
          <div className="text-sm text-muted-foreground">{tc('total', { count: filteredRows.length })}</div>
        </>
      )}

      <Sheet open={drawerOpen} onOpenChange={(open) => !open && closeDrawer()}>
        <SheetContent side="right" className="w-full sm:max-w-xl" data-testid="mr-ob-proxy-drawer">
          <SheetHeader>
            <SheetTitle>{editingId != null ? t('drawerTitleEdit') : t('drawerTitleNew')}</SheetTitle>
            <SheetDescription>{t('drawerDescription')}</SheetDescription>
          </SheetHeader>
          <div className="flex-1 space-y-4 overflow-y-auto px-4 py-4">
            <div className="space-y-3 rounded-lg border border-border p-4">
              <h4 className="text-sm font-medium">{t('sectionBasic')}</h4>
              <div className="space-y-1.5">
                <Label>
                  {t('fields.name')}
                  <span className="ml-0.5 text-destructive">*</span>
                </Label>
                <Input
                  value={draft.name}
                  onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
                  data-testid="mr-ob-proxy-name-input"
                />
                {nameErr && (
                  <p className="text-xs text-destructive" data-testid="mr-ob-proxy-name-error">
                    {nameErr}
                  </p>
                )}
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label>
                    {t('fields.proxyIp')}
                    <span className="ml-0.5 text-destructive">*</span>
                  </Label>
                  <Input
                    value={draft.proxyIp}
                    onChange={(e) => setDraft((d) => ({ ...d, proxyIp: e.target.value }))}
                    placeholder={t('fields.proxyIpPlaceholder')}
                    data-testid="mr-ob-proxy-ip-input"
                  />
                  {proxyIpErr && (
                    <p className="text-xs text-destructive" data-testid="mr-ob-proxy-ip-error">
                      {proxyIpErr}
                    </p>
                  )}
                </div>
                <div className="space-y-1.5">
                  <Label>
                    {t('fields.proxyPort')}
                    <span className="ml-0.5 text-destructive">*</span>
                  </Label>
                  <Input
                    type="number"
                    value={draft.proxyPort}
                    onChange={(e) => setDraft((d) => ({ ...d, proxyPort: Number(e.target.value) }))}
                    data-testid="mr-ob-proxy-port-input"
                  />
                  {proxyPortErr && (
                    <p className="text-xs text-destructive" data-testid="mr-ob-proxy-port-error">
                      {proxyPortErr}
                    </p>
                  )}
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label>
                    {t('fields.lid')}
                    <span className="ml-0.5 text-destructive">*</span>
                  </Label>
                  <Input
                    value={draft.lid}
                    onChange={(e) => setDraft((d) => ({ ...d, lid: e.target.value }))}
                    placeholder={t('fields.lidPlaceholder')}
                    data-testid="mr-ob-proxy-lid-input"
                  />
                  {lidErr && (
                    <p className="text-xs text-destructive" data-testid="mr-ob-proxy-lid-error">
                      {lidErr}
                    </p>
                  )}
                </div>
                <div className="space-y-1.5">
                  <Label>{t('fields.presendCode')}</Label>
                  <Input
                    type="number"
                    value={draft.presendCode}
                    onChange={(e) => setDraft((d) => ({ ...d, presendCode: Number(e.target.value) }))}
                    data-testid="mr-ob-proxy-presend-code-input"
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label>{t('fields.license')}</Label>
                <Input
                  type="password"
                  autoComplete="new-password"
                  value={draft.license}
                  onChange={(e) => setDraft((d) => ({ ...d, license: e.target.value }))}
                  placeholder={editingId != null ? t('fields.licenseEditPlaceholder') : ''}
                  data-testid="mr-ob-proxy-license-input"
                />
                <p className="text-xs text-muted-foreground">
                  {editingId != null
                    ? t(editingLicensePresent ? 'fields.licenseEditPresentHint' : 'fields.licenseEditAbsentHint')
                    : t('fields.licenseHint')}
                </p>
              </div>
              <div className="space-y-1.5">
                <Label>
                  {t('fields.egressIp')}
                </Label>
                <Input
                  value={draft.egressIp}
                  onChange={(e) => setDraft((d) => ({ ...d, egressIp: e.target.value }))}
                  placeholder={t('fields.egressIpPlaceholder')}
                  data-testid="mr-ob-proxy-egress-input"
                />
                <p className="text-xs text-muted-foreground">{t('fields.egressIpHint')}</p>
                {egressIpErr && (
                  <p className="text-xs text-destructive" data-testid="mr-ob-proxy-egress-error">
                    {egressIpErr}
                  </p>
                )}
              </div>
            </div>

            <div className="space-y-3 rounded-lg border border-border p-4">
              <h4 className="text-sm font-medium">{t('sectionHelo')}</h4>
              <div className="space-y-1.5">
                <Label>{t('fields.helo')}</Label>
                <Input
                  value={draft.heloHostname}
                  onChange={(e) => setDraft((d) => ({ ...d, heloHostname: e.target.value }))}
                  placeholder={t('fields.heloPlaceholder')}
                  data-testid="mr-ob-proxy-helo-input"
                />
                <p className="text-xs text-muted-foreground">{t('fields.heloHint')}</p>
                {heloErr && (
                  <p className="text-xs text-destructive" data-testid="mr-ob-proxy-helo-error">
                    {heloErr}
                  </p>
                )}
              </div>
              {showRdnsWarning && (
                <div
                  className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-400"
                  data-testid="mr-ob-proxy-rdns-warning"
                >
                  <AlertTriangle className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" />
                  {t('fields.rdnsWarning', { egress: draft.egressIp, ptr: MOCK_PTR_HOSTNAME, helo: heloTrimmed })}
                </div>
              )}
            </div>

            <div className="space-y-3 rounded-lg border border-border p-4">
              <h4 className="text-sm font-medium">{t('sectionTls')}</h4>
              <label className="flex items-center gap-2 text-sm">
                <Switch
                  checked={draft.useTls}
                  onCheckedChange={(c) => setDraft((d) => ({ ...d, useTls: c }))}
                  data-testid="mr-ob-proxy-use-tls-switch"
                />
                {t('fields.useTls')}
              </label>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label>{t('fields.tlsMinVersion')}</Label>
                  <Select
                    value={draft.tlsMinVersion}
                    onValueChange={(v) => setDraft((d) => ({ ...d, tlsMinVersion: v as TlsMinVersion }))}
                  >
                    <SelectTrigger className="w-full" data-testid="mr-ob-proxy-tls-select">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {TLS_MIN_VERSIONS.map((v) => (
                        <SelectItem key={v} value={v}>
                          TLSv{v}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>{t('fields.cipherProfile')}</Label>
                  <Select
                    value={draft.cipherProfile}
                    onValueChange={(v) => setDraft((d) => ({ ...d, cipherProfile: v as CipherProfile }))}
                  >
                    <SelectTrigger className="w-full" data-testid="mr-ob-proxy-cipher-select">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="default">{t('fields.cipherDefault')}</SelectItem>
                      <SelectItem value="high">{t('fields.cipherHigh')}</SelectItem>
                      <SelectItem value="compatible">{t('fields.cipherCompatible')}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <label className="flex items-center gap-2 text-sm">
                <Switch
                  checked={draft.status === 'enabled'}
                  onCheckedChange={(c) => setDraft((d) => ({ ...d, status: c ? 'enabled' : 'disabled' }))}
                  data-testid="mr-ob-proxy-active-switch"
                />
                {draft.status === 'enabled' ? t('fields.active') : t('fields.inactive')}
              </label>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={editingId == null || testState === 'loading'}
                  title={editingId == null ? t('fields.testConnectivityRequiresSaved') : undefined}
                  onClick={runTest}
                  data-testid="mr-ob-proxy-test-btn"
                >
                  {t('fields.testConnectivity')}
                </Button>
                <TestResultTag state={testState} testId="mr-ob-proxy-test-result" />
              </div>
            </div>
          </div>
          <SheetFooter>
            <Button onClick={handleSave} disabled={saveMutation.isPending} data-testid="mr-ob-proxy-save">
              {saveMutation.isPending && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
              {tc('save')}
            </Button>
            <Button variant="outline" onClick={closeDrawer} data-testid="mr-ob-proxy-cancel">
              {tc('cancel')}
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>

      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent data-testid="mr-ob-proxy-delete-dialog">
          <AlertDialogHeader>
            <AlertDialogTitle>{t('deleteDialogTitle', { name: deleteTarget?.name ?? '' })}</AlertDialogTitle>
            <AlertDialogDescription>{t('deleteDialogDescription')}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{tc('cancel')}</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => deleteTarget && deleteMutation.mutate(deleteTarget.id)}
              data-testid="mr-ob-proxy-delete-confirm"
            >
              {t('deleteConfirmButton')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
