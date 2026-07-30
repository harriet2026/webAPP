'use client';

// 出站路由步骤二：投递通道（Task 13 接通真实后端 —— proxysvr-groups，取代 mock-only 虚拟
// endpoint）。对齐 doc/html-spec/admin-forwarding/index.html §2.5 c-5「交互层级 0」+
// layer-6-outbound-channels.html（列表 6a + 抽屉 6b + 删除确认 6c）、doc/mail-routing.md §4。
//
// 代理数据由父组件（OutboundRoutingTab，与步骤一共用同一份 listProxysvrEndpoints 查询结果）通过
// props 传入，本组件不重复发起代理列表请求。
//
// 删除确认文案改为「被引用不可删」（后端 409 透传，spec §3.2/§11 修订 A2）：通道被投递规则引用
// 时删除会被服务端拦截（`internal/api/proxysvr.go` CountRouteRulesReferencingProxysvrGroup 门
// 禁），不是旧 demo 语义的"放行+规则 fallback 到默认通道"。

import { useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { Plus, Pencil, Trash2, ChevronUp, ChevronDown, AlertTriangle, Loader2 } from 'lucide-react';
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
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
import { useScopedApiRequest } from '@/lib/api/client';
import { listProxysvrGroups, createProxysvrGroup, updateProxysvrGroup, deleteProxysvrGroup } from '@/lib/api/proxysvr';
import { proxysvrGroupToRow, channelRowToRequest } from './channel-mapping';
import type { OutboundProxyRow, OutboundChannelRow } from './outbound-types';

interface ChannelStepProps {
  tenantId: number;
  /** 步骤一已配置的代理 IP（父组件传入，与步骤一共用同一份查询结果，本组件不重复请求）。 */
  proxies: OutboundProxyRow[];
}

function emptyDraft(): OutboundChannelRow {
  return { id: '', channelName: '', status: 'enabled', proxyIds: [] };
}

export function ChannelStep({ tenantId, proxies }: ChannelStepProps) {
  const t = useTranslations('mailRouting.outbound.channel');
  const ts = useTranslations('mailRouting.shared');
  const tc = useTranslations('common');
  const { apiRequest } = useScopedApiRequest(tenantId);
  const queryClient = useQueryClient();

  const queryKey = ['proxysvr-groups', tenantId];
  const { data: groups = [], isLoading } = useQuery({
    queryKey,
    queryFn: () => listProxysvrGroups(apiRequest),
  });
  const rows = useMemo(() => groups.map(proxysvrGroupToRow), [groups]);

  const [search, setSearch] = useState('');
  const filteredRows = useMemo(() => {
    const kw = search.trim().toLowerCase();
    return rows.filter((r) => !kw || r.channelName.toLowerCase().includes(kw));
  }, [rows, search]);

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<OutboundChannelRow>(emptyDraft());
  const [deleteTarget, setDeleteTarget] = useState<OutboundChannelRow | null>(null);

  const invalidate = () => queryClient.invalidateQueries({ queryKey });

  const openCreate = () => {
    setDraft(emptyDraft());
    setEditingId(null);
    setDrawerOpen(true);
  };

  const openEdit = (row: OutboundChannelRow) => {
    setDraft({ id: row.id, channelName: row.channelName, status: row.status, proxyIds: [...row.proxyIds] });
    setEditingId(row.id);
    setDrawerOpen(true);
  };

  const closeDrawer = () => {
    setDrawerOpen(false);
    setEditingId(null);
  };

  const toggleProxy = (proxyId: string, checked: boolean) => {
    setDraft((d) => ({
      ...d,
      proxyIds: checked ? [...d.proxyIds, proxyId] : d.proxyIds.filter((id) => id !== proxyId),
    }));
  };

  const moveProxy = (index: number, dir: -1 | 1) => {
    setDraft((d) => {
      const arr = [...d.proxyIds];
      const target = index + dir;
      if (target < 0 || target >= arr.length) return d;
      [arr[index], arr[target]] = [arr[target], arr[index]];
      return { ...d, proxyIds: arr };
    });
  };

  const removeProxy = (proxyId: string) => {
    setDraft((d) => ({ ...d, proxyIds: d.proxyIds.filter((id) => id !== proxyId) }));
  };

  const heloDisplayFor = (p: OutboundProxyRow) => p.heloHostname || t('systemDefaultHelo');

  const selectedProxies = useMemo(
    () => draft.proxyIds.map((id) => proxies.find((p) => p.id === id)).filter((p): p is OutboundProxyRow => !!p),
    [draft.proxyIds, proxies],
  );
  const uniqueHelos = useMemo(
    () => Array.from(new Set(selectedProxies.map(heloDisplayFor))),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [selectedProxies],
  );
  const heloListText = uniqueHelos.join(' vs ');
  const heloInconsistent = uniqueHelos.length > 1;

  const nameTrimmed = draft.channelName.trim();
  const nameErr = !nameTrimmed
    ? t('fields.nameRequired')
    : rows.some((r) => r.id !== editingId && r.channelName === nameTrimmed)
      ? t('fields.nameDuplicate')
      : '';
  const proxiesErr = draft.proxyIds.length === 0 ? t('fields.proxiesRequired') : '';
  const hasError = !!(nameErr || proxiesErr);

  const saveMutation = useMutation({
    mutationFn: () => {
      const body = channelRowToRequest({ ...draft, channelName: nameTrimmed });
      return editingId != null
        ? updateProxysvrGroup(Number(editingId), body, apiRequest)
        : createProxysvrGroup(body, apiRequest);
    },
    onSuccess: () => {
      toast.success(editingId != null ? t('toasts.updated') : t('toasts.created'));
      if (heloInconsistent) {
        toast.warning(t('toasts.heloInconsistent', { list: heloListText }));
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
    mutationFn: (id: string) => deleteProxysvrGroup(Number(id), apiRequest),
    onSuccess: () => {
      toast.success(t('toasts.deleted'));
      setDeleteTarget(null);
      invalidate();
    },
    // 409（被引用）与其它错误都走同一条 toast——ApiError.message 已经是后端透传的可读文案
    // （"proxysvr group is referenced by one or more outbound route rules ..."），不需要
    // 额外分支特判状态码。
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-4" data-testid="mr-ob-channel-root">
      <ListToolbar
        search={search}
        onSearchChange={setSearch}
        searchPlaceholder={t('searchPlaceholder')}
        onReset={() => setSearch('')}
        actions={
          <Button size="sm" className="h-9 gap-1.5" onClick={openCreate} data-testid="mr-ob-channel-create">
            <Plus className="h-4 w-4" />
            {ts('create')}
          </Button>
        }
        testIdPrefix="mr-ob-channel"
      />

      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : filteredRows.length === 0 ? (
        <div data-testid="mr-ob-channel-empty">
          <EmptyState
            title={t('emptyText')}
            action={
              <Button variant="outline" size="sm" onClick={openCreate}>
                {ts('addNow')}
              </Button>
            }
          />
        </div>
      ) : (
        <>
          <Table data-testid="mr-ob-channel-table">
            <TableHeader>
              <TableRow>
                <TableHead>{t('columns.id')}</TableHead>
                <TableHead>{t('columns.name')}</TableHead>
                <TableHead>{t('columns.status')}</TableHead>
                <TableHead className="max-w-[360px]">{t('columns.proxies')}</TableHead>
                <TableHead className="w-[160px]">{t('columns.actions')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredRows.map((row) => (
                <TableRow key={row.id} data-testid={`mr-ob-channel-row-${row.id}`}>
                  <TableCell className="text-muted-foreground">{row.id}</TableCell>
                  <TableCell className="font-medium">{row.channelName}</TableCell>
                  <TableCell>
                    {row.status === 'enabled' ? (
                      <Badge className="border-transparent bg-blue-600 font-normal text-white hover:bg-blue-600">
                        {t('fields.active')}
                      </Badge>
                    ) : (
                      <Badge className="border-transparent bg-gray-100 font-normal text-gray-500 hover:bg-gray-100 dark:bg-gray-800 dark:text-gray-400">
                        {t('fields.inactive')}
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell className="max-w-[360px]">
                    <div className="flex flex-wrap gap-1">
                      {row.proxyIds.map((pid) => {
                        const proxy = proxies.find((p) => p.id === pid);
                        if (!proxy) {
                          return (
                            <Badge
                              key={pid}
                              variant="outline"
                              className="border-red-300 font-normal text-red-600"
                              data-testid={`mr-ob-channel-badge-stale-${row.id}-${pid}`}
                            >
                              {t('proxyDeletedBadge')}
                            </Badge>
                          );
                        }
                        return (
                          <Badge key={pid} variant="secondary" className="font-normal">
                            {t('fields.proxyBadge', { name: proxy.name, ip: proxy.proxyIp, helo: heloDisplayFor(proxy) })}
                          </Badge>
                        );
                      })}
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-0.5">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 gap-1 text-blue-600"
                        onClick={() => openEdit(row)}
                        data-testid={`mr-ob-channel-edit-${row.id}`}
                      >
                        <Pencil className="h-3.5 w-3.5" />
                        {t('editButton')}
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 gap-1 text-red-600"
                        onClick={() => setDeleteTarget(row)}
                        data-testid={`mr-ob-channel-delete-${row.id}`}
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
        <SheetContent side="right" className="w-full sm:max-w-xl" data-testid="mr-ob-channel-drawer">
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
                  value={draft.channelName}
                  onChange={(e) => setDraft((d) => ({ ...d, channelName: e.target.value }))}
                  data-testid="mr-ob-channel-name-input"
                />
                {nameErr && (
                  <p className="text-xs text-destructive" data-testid="mr-ob-channel-name-error">
                    {nameErr}
                  </p>
                )}
              </div>
              <label className="flex items-center gap-2 text-sm">
                <Switch
                  checked={draft.status === 'enabled'}
                  onCheckedChange={(c) => setDraft((d) => ({ ...d, status: c ? 'enabled' : 'disabled' }))}
                  data-testid="mr-ob-channel-active-switch"
                />
                {draft.status === 'enabled' ? t('fields.active') : t('fields.inactive')}
              </label>
            </div>

            <div className="space-y-3 rounded-lg border border-border p-4">
              <div>
                <h4 className="text-sm font-medium">{t('sectionProxies')}</h4>
                <p className="mt-0.5 text-xs text-muted-foreground">{t('sectionProxiesHint')}</p>
              </div>
              <div
                className="max-h-44 space-y-1.5 overflow-y-auto rounded-md border border-input p-2"
                data-testid="mr-ob-channel-proxy-list"
              >
                {proxies.map((proxy) => (
                  <label
                    key={proxy.id}
                    className="flex cursor-pointer items-center gap-2 rounded px-2 py-1 text-sm hover:bg-gray-50 dark:hover:bg-gray-900/40"
                  >
                    <Checkbox
                      checked={draft.proxyIds.includes(proxy.id)}
                      onCheckedChange={(c) => toggleProxy(proxy.id, !!c)}
                      data-testid={`mr-ob-channel-proxy-check-${proxy.id}`}
                    />
                    {t('fields.proxyOption', { name: proxy.name, ip: proxy.proxyIp, helo: heloDisplayFor(proxy) })}
                  </label>
                ))}
              </div>
              {proxiesErr && (
                <p className="text-xs text-destructive" data-testid="mr-ob-channel-proxies-error">
                  {proxiesErr}
                </p>
              )}
            </div>

            {selectedProxies.length > 0 && (
              <div className="space-y-3 rounded-lg border border-border p-4">
                <h4 className="text-sm font-medium">{t('sectionSelected')}</h4>
                {heloInconsistent && (
                  <div
                    className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-400"
                    data-testid="mr-ob-channel-helo-warning"
                  >
                    <AlertTriangle className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" />
                    {t('heloWarning', { list: heloListText })}
                  </div>
                )}
                <Table data-testid="mr-ob-channel-selected-table">
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t('selectedColumns.name')}</TableHead>
                      <TableHead>{t('selectedColumns.ip')}</TableHead>
                      <TableHead>{t('selectedColumns.helo')}</TableHead>
                      <TableHead>{t('selectedColumns.port')}</TableHead>
                      <TableHead>{t('selectedColumns.priority')}</TableHead>
                      <TableHead className="w-[120px]">{t('selectedColumns.actions')}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {selectedProxies.map((proxy, index) => (
                      <TableRow key={proxy.id} data-testid={`mr-ob-channel-selected-row-${proxy.id}`}>
                        <TableCell>{proxy.name}</TableCell>
                        <TableCell>{proxy.proxyIp}</TableCell>
                        <TableCell>{heloDisplayFor(proxy)}</TableCell>
                        <TableCell>{proxy.proxyPort}</TableCell>
                        <TableCell>{index + 1}</TableCell>
                        <TableCell>
                          <div className="flex items-center gap-0.5">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-6 w-6"
                              disabled={index === 0}
                              onClick={() => moveProxy(index, -1)}
                              aria-label={t('moveUp')}
                              data-testid={`mr-ob-channel-move-up-${proxy.id}`}
                            >
                              <ChevronUp className="h-3.5 w-3.5" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-6 w-6"
                              disabled={index === selectedProxies.length - 1}
                              onClick={() => moveProxy(index, 1)}
                              aria-label={t('moveDown')}
                              data-testid={`mr-ob-channel-move-down-${proxy.id}`}
                            >
                              <ChevronDown className="h-3.5 w-3.5" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-6 w-6 text-red-600"
                              onClick={() => removeProxy(proxy.id)}
                              aria-label={t('removeButton')}
                              data-testid={`mr-ob-channel-remove-${proxy.id}`}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </div>
          <SheetFooter>
            <Button onClick={handleSave} disabled={saveMutation.isPending} data-testid="mr-ob-channel-save">
              {saveMutation.isPending && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
              {tc('save')}
            </Button>
            <Button variant="outline" onClick={closeDrawer} data-testid="mr-ob-channel-cancel">
              {tc('cancel')}
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>

      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent data-testid="mr-ob-channel-delete-dialog">
          <AlertDialogHeader>
            <AlertDialogTitle>{t('deleteDialogTitle', { name: deleteTarget?.channelName ?? '' })}</AlertDialogTitle>
            <AlertDialogDescription>{t('deleteDialogDescription')}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{tc('cancel')}</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => deleteTarget && deleteMutation.mutate(deleteTarget.id)}
              data-testid="mr-ob-channel-delete-confirm"
            >
              {t('deleteConfirmButton')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
