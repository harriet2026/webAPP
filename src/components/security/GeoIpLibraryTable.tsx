'use client';

import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocale, useTranslations } from 'next-intl';
import { ColumnDef } from '@tanstack/react-table';
import { AlertTriangle, ChevronsUpDown, Download, FileText, Info, Loader2, Pencil, Plus, RotateCcw, Search, Trash2, Upload } from 'lucide-react';
import { format } from 'date-fns';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { DataTable } from '@/components/shared/data-table';
import { EmptyState } from '@/components/shared/empty-state';
import { ConfirmDialog } from '@/components/shared/confirm-dialog';
import { cn } from '@/lib/utils';
import {
  createGeoIpRule,
  deleteGeoIpRule,
  exportGeoIpRules,
  filterGeoCountries,
  geoCountryDisplayName,
  listGeoCountries,
  listGeoIpRules,
  updateGeoIpRule,
} from '@/lib/api/geoip-rules';
import type { GeoIpRule } from '@/types/overseas-mail';

const PAGE_SIZE = 10;

interface GeoIpFormState {
  ipRange: string;
  regionCode: string;
  regionName: string;
  /** Tracks whether 归属地 was manually edited — gates the region-select auto-fill, mirroring demo's `geoFormRegionDirty`. */
  regionDirty: boolean;
}

const EMPTY_FORM: GeoIpFormState = { ipRange: '', regionCode: '', regionName: '', regionDirty: false };

/**
 * Valid GeoIP custom-rule address: IPv4 single/CIDR (/0–/32) or IPv6
 * single/CIDR (/0–/128). Keep this in step with models.ParseGeoIpCIDR.
 */
export function isValidGeoIpRange(value: string): boolean {
  const v = value.trim();
  if (!v) return false;
  const [ip, prefix, extra] = v.split('/');
  const parts = ip.split('.');
  const isIPv4 =
    parts.length === 4 && parts.every((p) => /^\d{1,3}$/.test(p) && Number(p) >= 0 && Number(p) <= 255);
  let isIPv6 = false;
  if (!isIPv4 && ip.includes(':')) {
    try {
      isIPv6 = new URL(`http://[${ip}]/`).hostname.length > 0;
    } catch {
      isIPv6 = false;
    }
  }
  if (!isIPv4 && !isIPv6) return false;
  if (prefix === undefined) return true; // 单地址
  if (extra !== undefined || !/^\d+$/.test(prefix)) return false;
  const n = Number(prefix);
  // GT-12103: 原型规格 IPv4 CIDR /0–/32、IPv6 /0–/128（07-15 曾误设 IPv4 下界 /8）。
  return isIPv4 ? n >= 0 && n <= 32 : n >= 0 && n <= 128;
}

export function GeoIpLibraryTable() {
  const t = useTranslations();
  const locale = useLocale();
  const queryClient = useQueryClient();

  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [editingRule, setEditingRule] = useState<GeoIpRule | null>(null);
  const [form, setForm] = useState<GeoIpFormState>(EMPTY_FORM);
  const [errors, setErrors] = useState<{ ipRange?: string; regionCode?: string }>({});
  const [deleteTarget, setDeleteTarget] = useState<GeoIpRule | null>(null);
  // GT-12114 Q-03：地区可搜索下拉（常用20国默认 + 搜索全量字典）
  const [regionOpen, setRegionOpen] = useState(false);
  const [regionSearch, setRegionSearch] = useState('');

  const { data: countriesData } = useQuery({
    queryKey: ['geoip-countries'],
    queryFn: () => listGeoCountries(),
    staleTime: Infinity, // 静态字典
  });
  const countries = useMemo(() => countriesData?.items ?? [], [countriesData]);
  const countryByCode = useMemo(() => new Map(countries.map((c) => [c.code, c])), [countries]);
  const visibleCountries = useMemo(
    () => filterGeoCountries(countries, regionSearch),
    [countries, regionSearch],
  );

  const queryKey = ['geoip-rules', page, search];
  const { data, isLoading } = useQuery({
    queryKey,
    queryFn: () => listGeoIpRules({ page, page_size: PAGE_SIZE, search: search || undefined }),
  });

  const items = data?.items ?? [];
  const total = data?.total ?? 0;

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['geoip-rules'] });

  const closeSheet = () => {
    setSheetOpen(false);
    setEditingRule(null);
    setForm(EMPTY_FORM);
    setErrors({});
  };

  const createMutation = useMutation({
    mutationFn: (body: { ip_range: string; region_code: string; region_name: string }) => createGeoIpRule(body),
    onSuccess: () => {
      invalidate();
      toast.success(t('common.saveSuccess'));
      closeSheet();
    },
    onError: () => toast.error(t('common.saveFailed')),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, body }: { id: number; body: { ip_range: string; region_code: string; region_name: string } }) =>
      updateGeoIpRule(id, body),
    onSuccess: () => {
      invalidate();
      toast.success(t('common.saveSuccess'));
      closeSheet();
    },
    onError: () => toast.error(t('common.saveFailed')),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => deleteGeoIpRule(id),
    onSuccess: () => {
      invalidate();
      toast.success(t('common.deleteSuccess'));
      setDeleteTarget(null);
    },
    onError: () => toast.error(t('common.error')),
  });

  const isSaving = createMutation.isPending || updateMutation.isPending;
  // GT-12103: 保存按钮在非法 IP/CIDR 或缺地区时禁用，杜绝非法记录入库。
  const canSave = !!form.regionCode && isValidGeoIpRange(form.ipRange);

  const openCreate = () => {
    setEditingRule(null);
    setForm(EMPTY_FORM);
    setErrors({});
    setSheetOpen(true);
  };

  const openEdit = (rule: GeoIpRule) => {
    setEditingRule(rule);
    setForm({ ipRange: rule.ip_range, regionCode: rule.region_code, regionName: rule.region_name, regionDirty: true });
    setErrors({});
    setSheetOpen(true);
  };

  const handleRegionChange = (value: string) => {
    setForm((prev) => {
      const next: GeoIpFormState = { ...prev, regionCode: value };
      if (!prev.regionDirty) {
        const country = countryByCode.get(value);
        next.regionName = country ? geoCountryDisplayName(country, locale) : value;
      }
      return next;
    });
    setErrors((prev) => ({ ...prev, regionCode: undefined }));
  };

  // GT-12114 Q-07：导出（JSON/CSV）。导入本期仍为占位禁用。
  const handleExport = async (fmt: 'json' | 'csv') => {
    try {
      const blob = await exportGeoIpRules(fmt);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `geoip-rules-${format(new Date(), 'yyyyMMdd')}.${fmt}`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch {
      toast.error(t('common.error'));
    }
  };

  const handleSave = () => {
    const nextErrors: { ipRange?: string; regionCode?: string } = {};
    if (!form.ipRange.trim()) nextErrors.ipRange = t('geoipLibrary.ipRequired');
    else if (!isValidGeoIpRange(form.ipRange)) nextErrors.ipRange = t('geoipLibrary.ipRangeFormat');
    if (!form.regionCode) nextErrors.regionCode = t('geoipLibrary.regionRequired');
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;

    const body = {
      ip_range: form.ipRange.trim(),
      region_code: form.regionCode,
      region_name: form.regionName.trim(),
    };
    if (editingRule) {
      updateMutation.mutate({ id: editingRule.id, body });
    } else {
      createMutation.mutate(body);
    }
  };

  const columns: ColumnDef<GeoIpRule>[] = [
    {
      id: 'ipRange',
      header: t('geoipLibrary.colIpRange'),
      cell: ({ row }) => <span className="font-mono text-sm">{row.original.ip_range}</span>,
    },
    {
      id: 'regionCode',
      header: t('geoipLibrary.colRegionCode'),
      cell: ({ row }) => <Badge variant="outline">{row.original.region_code}</Badge>,
    },
    {
      id: 'regionName',
      header: t('geoipLibrary.colRegionName'),
      cell: ({ row }) => row.original.region_name,
    },
    {
      id: 'updatedAt',
      header: t('geoipLibrary.colModifyTime'),
      cell: ({ row }) => (
        <span className="text-sm text-muted-foreground">
          {row.original.updated_at ? format(new Date(row.original.updated_at), 'yyyy-MM-dd HH:mm') : '--'}
        </span>
      ),
    },
    {
      id: 'actions',
      header: t('common.actions'),
      cell: ({ row }) => (
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(row.original)}>
            <Pencil className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setDeleteTarget(row.original)}>
            <Trash2 className="h-4 w-4 text-destructive" />
          </Button>
        </div>
      ),
      size: 100,
    },
  ];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-medium">{t('geoipLibrary.title')}</h4>
        <div className="flex items-center gap-2">
          <Button size="sm" onClick={openCreate}>
            <Plus className="h-4 w-4 mr-1" />
            {t('geoipLibrary.createRule')}
          </Button>
          {/* 导入：占位禁用（GT-12114 Q-07 产品决策首期只做导出） */}
          <Button variant="outline" size="sm" disabled>
            <Upload className="h-4 w-4 mr-1" />
            {t('common.import')}
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger render={<Button variant="outline" size="sm" />}>
              <Download className="h-4 w-4 mr-1" />
              {t('common.export')}
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => handleExport('json')}>
                {t('geoipLibrary.exportJSON')}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => handleExport('csv')}>
                {t('geoipLibrary.exportCSV')}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <div className="relative max-w-xs flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder={t('geoipLibrary.searchPlaceholder')}
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            className="pl-9"
          />
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            setSearch('');
            setPage(1);
          }}
        >
          <RotateCcw className="h-4 w-4 mr-1" />
          {t('common.reset')}
        </Button>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin" />
        </div>
      ) : items.length === 0 ? (
        <div className="rounded-lg border">
          <EmptyState
            icon={
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted">
                <FileText className="h-6 w-6 text-muted-foreground" />
              </div>
            }
            title={t('geoipLibrary.emptyText')}
            action={
              <Button variant="outline" size="sm" onClick={openCreate}>
                <Plus className="h-4 w-4 mr-1" />
                {t('geoipLibrary.createNow')}
              </Button>
            }
          />
        </div>
      ) : (
        <DataTable
          columns={columns}
          data={items}
          pageSize={PAGE_SIZE}
          pageCount={Math.max(1, Math.ceil(total / PAGE_SIZE))}
          pageIndex={page - 1}
          onPageChange={(newPage) => setPage(newPage + 1)}
        />
      )}

      <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 dark:border-amber-800 dark:bg-amber-950/30">
        <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0 text-amber-600 dark:text-amber-400" />
        <span className="text-sm text-amber-700 dark:text-amber-300">{t('geoipLibrary.priorityNote')}</span>
      </div>

      {/* GT-12114 Q-08：私网段（RFC1918）无地理归属，GeoIP 判定不触发 */}
      <div className="flex items-start gap-2 text-xs text-muted-foreground">
        <Info className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" />
        <span>{t('geoipLibrary.privateIpNote')}</span>
      </div>

      {/* 新增/编辑 Sheet —— 立即 CRUD（与 demo 的延迟保存有意不同，见 plan §1.1） */}
      <Sheet open={sheetOpen} onOpenChange={(open) => (open ? setSheetOpen(true) : closeSheet())}>
        <SheetContent className="flex w-[560px] flex-col p-0 sm:max-w-[560px]" showCloseButton={false}>
          <SheetHeader className="flex-shrink-0 border-b px-6 py-4">
            <div className="flex items-center justify-between">
              <div>
                <SheetTitle className="text-lg font-semibold">
                  {editingRule ? t('geoipLibrary.editTitle') : t('geoipLibrary.addTitle')}
                </SheetTitle>
                <p className="mt-1 text-sm text-muted-foreground">{t('geoipLibrary.sheetDesc')}</p>
              </div>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" onClick={closeSheet}>
                  {t('common.cancel')}
                </Button>
                <Button size="sm" disabled={isSaving || !canSave} onClick={handleSave}>
                  {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  {t('common.save')}
                </Button>
              </div>
            </div>
          </SheetHeader>

          <div className="flex-1 overflow-y-auto p-6">
            <div className="space-y-6">
              <div className="rounded-lg bg-muted/50 p-5">
                <div className="mb-4 flex items-center gap-2">
                  <div className="h-5 w-1 rounded-full bg-blue-500" />
                  <h3 className="font-medium">{t('geoipLibrary.basicSettings')}</h3>
                </div>
                <div className="space-y-4">
                  {/* IP 地址/段 */}
                  <div className="flex items-center gap-3">
                    <Label className="w-[100px] min-w-[100px] shrink-0 text-right">
                      <span className="text-red-500">*</span> {t('geoipLibrary.ipRangeLabel')}
                    </Label>
                    <div className="flex-1">
                      <Input
                        placeholder={t('geoipLibrary.ipRangePlaceholder')}
                        value={form.ipRange}
                        onChange={(e) => {
                          const value = e.target.value;
                          setForm((prev) => ({ ...prev, ipRange: value }));
                          if (errors.ipRange) setErrors((prev) => ({ ...prev, ipRange: undefined }));
                        }}
                        disabled={!!editingRule}
                        aria-invalid={!!errors.ipRange}
                        className={cn(errors.ipRange && 'border-red-500')}
                      />
                      {errors.ipRange ? (
                        <p className="mt-1 text-xs text-red-500">{errors.ipRange}</p>
                      ) : (
                        <p className="mt-1 text-xs text-muted-foreground">{t('geoipLibrary.ipRangeFormat')}</p>
                      )}
                    </div>
                  </div>

                  {/* 地区代码 */}
                  <div className="flex items-center gap-3">
                    <Label className="w-[100px] min-w-[100px] shrink-0 text-right">
                      <span className="text-red-500">*</span> {t('geoipLibrary.regionCodeLabel')}
                    </Label>
                    <div className="flex-1">
                      {/* GT-12114 Q-03：常用20国默认展示 + 搜索补全全量 ISO 字典 */}
                      <Popover open={regionOpen} onOpenChange={(open) => { setRegionOpen(open); if (!open) setRegionSearch(''); }}>
                        <PopoverTrigger
                          render={
                            <Button
                              variant="outline"
                              role="combobox"
                              aria-expanded={regionOpen}
                              className={cn('w-full justify-between font-normal', errors.regionCode && 'border-red-500')}
                            />
                          }
                        >
                          <span className={cn('truncate', !form.regionCode && 'text-muted-foreground')}>
                            {form.regionCode
                              ? `${countryByCode.get(form.regionCode) ? geoCountryDisplayName(countryByCode.get(form.regionCode)!, locale) : form.regionCode} (${form.regionCode})`
                              : t('geoipLibrary.selectRegion')}
                          </span>
                          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                        </PopoverTrigger>
                        <PopoverContent className="w-[--anchor-width] min-w-64 p-0" align="start">
                          <Command shouldFilter={false}>
                            <CommandInput
                              placeholder={t('geoipLibrary.searchCountry')}
                              value={regionSearch}
                              onValueChange={setRegionSearch}
                            />
                            <CommandList>
                              <CommandEmpty>{t('geoipLibrary.noCountryFound')}</CommandEmpty>
                              <CommandGroup>
                                {visibleCountries.map((country) => (
                                  <CommandItem
                                    key={country.code}
                                    value={country.code}
                                    onSelect={() => {
                                      handleRegionChange(country.code);
                                      setRegionOpen(false);
                                      setRegionSearch('');
                                    }}
                                  >
                                    {geoCountryDisplayName(country, locale)} ({country.code})
                                  </CommandItem>
                                ))}
                              </CommandGroup>
                            </CommandList>
                          </Command>
                        </PopoverContent>
                      </Popover>
                      {errors.regionCode && <p className="mt-1 text-xs text-red-500">{errors.regionCode}</p>}
                    </div>
                  </div>

                  {/* 归属地 */}
                  <div className="flex items-center gap-3">
                    <Label className="w-[100px] min-w-[100px] shrink-0 text-right">
                      {t('geoipLibrary.regionNameLabel')}
                    </Label>
                    <div className="flex-1">
                      <Input
                        placeholder={t('geoipLibrary.regionNamePlaceholder')}
                        value={form.regionName}
                        onChange={(e) =>
                          setForm((prev) => ({ ...prev, regionName: e.target.value.slice(0, 50), regionDirty: true }))
                        }
                        maxLength={50}
                      />
                      <p className="mt-1 text-xs text-muted-foreground">{t('geoipLibrary.autoFillHint')}</p>
                    </div>
                  </div>
                </div>
              </div>

              <div className="rounded-lg border border-blue-200 bg-blue-50 p-3 dark:border-blue-800 dark:bg-blue-950/30">
                <div className="flex items-start gap-2">
                  <Info className="mt-0.5 h-4 w-4 flex-shrink-0 text-blue-500" />
                  <p className="text-sm text-blue-700 dark:text-blue-300">{t('geoipLibrary.usageTip')}</p>
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
        title={t('common.delete')}
        description={t('common.confirmDelete')}
        onConfirm={() => {
          if (deleteTarget) deleteMutation.mutate(deleteTarget.id);
        }}
        variant="destructive"
      />
    </div>
  );
}
