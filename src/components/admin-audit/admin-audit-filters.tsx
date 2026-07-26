'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { OP_TYPE_META, AUDIT_MODULE_GROUPS, filterVisibleModuleGroups } from './admin-audit-taxonomy';
import { useAuth } from '@/contexts/auth-context';
import { useProductForm } from '@/contexts/product-form-context';
import { visibleNavIds, isNavItemAllowed } from '@/components/layout/sidebar-visibility';

const OP_TYPE_KEYS = Object.keys(OP_TYPE_META).sort();

export interface AdminFilterState {
  keyword: string;
  module: string;
  opType: string;
  result: string;
  tenant: string;
}

export const EMPTY_ADMIN_FILTERS: AdminFilterState = {
  keyword: '',
  module: '',
  opType: '',
  result: '',
  tenant: '',
};

// AdminFilterParams is the subset of backend query params the filter card owns
// (keyword/action/resource_type/status). Tenant scope + layer are derived from
// other page state (drill-down / view mode), not from these fields.
export interface AdminFilterParams {
  keyword?: string;
  action?: string;
  resource_type?: string;
  status?: 'success' | 'failed';
}

// filtersToParams maps the UI filter state to the backend query params it drives.
// Empty strings collapse to undefined, so EMPTY_ADMIN_FILTERS maps to an all-empty
// object — i.e. resetting to EMPTY_ADMIN_FILTERS clears every server-side filter.
export function filtersToParams(f: AdminFilterState): AdminFilterParams {
  return {
    keyword: f.keyword || undefined,
    action: f.opType || undefined,
    resource_type: f.module || undefined,
    status: (f.result as 'success' | 'failed' | undefined) || undefined,
  };
}

interface TenantOption {
  id: number;
  name: string;
}

interface AdminAuditFiltersProps {
  value: AdminFilterState;
  onChange: (next: AdminFilterState) => void;
  onReset: () => void;
  showTenant?: boolean;
  tenants?: TenantOption[];
}

export function AdminAuditFilters({
  value,
  onChange,
  onReset,
  showTenant,
  tenants,
}: AdminAuditFiltersProps) {
  const t = useTranslations();
  // GT-12376: gate「操作模块」options by the SAME sidebar menu visibility, so a
  // platform admin no longer sees tenant-only modules (组织通讯录) or locked
  // agents (钓鱼/仿冒智能体) as filter options.
  const { hasPermission, isSystemAdmin, showAdvancedRules, canSeeRoute } = useAuth();
  const { capabilities, registry, viewer, grants } = useProductForm();
  const visibleGroups = useMemo(() => {
    const formVisible = capabilities ? new Set(visibleNavIds(registry, capabilities, viewer, grants)) : null;
    const ctx = {
      hasPermission,
      isSystemAdmin,
      showAdvancedRules,
      canSeeRoute,
      registry,
      formVisible,
      capabilities,
      viewer,
    };
    return filterVisibleModuleGroups(
      AUDIT_MODULE_GROUPS,
      (item) => isNavItemAllowed(item, ctx),
      (featureId) => !!formVisible?.has(featureId),
    );
  }, [hasPermission, isSystemAdmin, showAdvancedRules, canSeeRoute, capabilities, registry, viewer, grants]);
  const [keywordInput, setKeywordInput] = useState(value.keyword);
  const lastEmitted = useRef(value.keyword);

  useEffect(() => {
    if (value.keyword !== lastEmitted.current && value.keyword !== keywordInput) {
      lastEmitted.current = value.keyword;
      // eslint-disable-next-line react-hooks/set-state-in-effect -- parent reset/override: resync the local input box with the canonical filter value.
      setKeywordInput(value.keyword);
    }
  }, [value.keyword, keywordInput]);

  useEffect(() => {
    if (keywordInput === lastEmitted.current) return;
    const handle = setTimeout(() => {
      lastEmitted.current = keywordInput;
      onChange({ ...value, keyword: keywordInput });
    }, 300);
    return () => clearTimeout(handle);
  }, [keywordInput, value, onChange]);

  // Base UI's <Select.Value> shows the raw value unless the Root gets `items`,
  // so every Select here rendered its raw code (tenant id, module key,
  // "success", ...) in the trigger instead of the label (GT-12021).
  //
  // No map carries an entry for the "" (all) option: Base UI treats an empty
  // string as "nothing selected" (hasSelectedValue is false), so it renders the
  // placeholder and never consults `items` for it.
  const tenantItems = useMemo(
    () => Object.fromEntries((tenants ?? []).map((tenant) => [String(tenant.id), tenant.name])),
    [tenants],
  );
  const moduleItems = useMemo(
    () =>
      Object.fromEntries(
        visibleGroups.flatMap((group) =>
          group.items.map((item) => [item.value, t(item.subKey)]),
        ),
      ),
    [t, visibleGroups],
  );
  const opTypeItems = useMemo(
    () => Object.fromEntries(OP_TYPE_KEYS.map((op) => [op, t(OP_TYPE_META[op].labelKey)])),
    [t],
  );
  const resultItems = useMemo(
    () => ({
      success: t('adminAudit.stats.success'),
      failed: t('adminAudit.stats.failed'),
    }),
    [t],
  );

  // GT-12439: html_spec 原型每个筛选控件都带字段标签在上方，且三个下拉的默认
  // 选中值显示「全部」（而非空占位符）。这里给每个控件补 <label>，并把三个类目
  // 下拉的占位符改为「全部」，与原型 §2.3 对齐、同时保留字段语境。
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3" data-testid="admin-audit-filters">
      {showTenant ? (
        <div className="flex flex-col gap-1.5">
          <label className="text-sm leading-none text-muted-foreground">{t('adminAudit.filter.tenant')}</label>
          <Select
            items={tenantItems}
            value={value.tenant}
            onValueChange={(v) => onChange({ ...value, tenant: v ?? '' })}
          >
            <SelectTrigger className="w-full" data-testid="admin-audit-filter-tenant">
              <SelectValue placeholder={t('common.all')} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="">{t('common.all')}</SelectItem>
              {(tenants ?? []).map((tenant) => (
                <SelectItem key={tenant.id} value={String(tenant.id)}>
                  {tenant.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      ) : null}

      <div className="flex flex-col gap-1.5">
        <label className="text-sm leading-none text-muted-foreground">{t('adminAudit.filter.keyword')}</label>
        <Input
          data-testid="admin-audit-filter-keyword"
          placeholder={t('adminAudit.filter.keyword')}
          value={keywordInput}
          onChange={(e) => setKeywordInput(e.target.value)}
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <label className="text-sm leading-none text-muted-foreground">{t('adminAudit.filter.module')}</label>
        <Select
          items={moduleItems}
          value={value.module}
          onValueChange={(v) => onChange({ ...value, module: v ?? '' })}
        >
          <SelectTrigger className="w-full" data-testid="admin-audit-filter-module">
            <SelectValue placeholder={t('common.all')} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="">{t('common.all')}</SelectItem>
            {visibleGroups.map((group) => (
              <SelectGroup key={group.topKey}>
                <SelectLabel>{t(group.topKey)}</SelectLabel>
                {group.items.map((item) => (
                  <SelectItem key={item.value} value={item.value}>
                    {t(item.subKey)}
                  </SelectItem>
                ))}
              </SelectGroup>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="flex flex-col gap-1.5">
        <label className="text-sm leading-none text-muted-foreground">{t('adminAudit.filter.opType')}</label>
        <Select
          items={opTypeItems}
          value={value.opType}
          onValueChange={(v) => onChange({ ...value, opType: v ?? '' })}
        >
          <SelectTrigger className="w-full" data-testid="admin-audit-filter-optype">
            <SelectValue placeholder={t('common.all')} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="">{t('common.all')}</SelectItem>
            {OP_TYPE_KEYS.map((op) => (
              <SelectItem key={op} value={op}>
                {t(OP_TYPE_META[op].labelKey)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="flex flex-col gap-1.5">
        <label className="text-sm leading-none text-muted-foreground">{t('adminAudit.filter.result')}</label>
        <Select
          items={resultItems}
          value={value.result}
          onValueChange={(v) => onChange({ ...value, result: v ?? '' })}
        >
          <SelectTrigger className="w-full" data-testid="admin-audit-filter-result">
            <SelectValue placeholder={t('common.all')} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="">{t('common.all')}</SelectItem>
            <SelectItem value="success">{t('adminAudit.stats.success')}</SelectItem>
            <SelectItem value="failed">{t('adminAudit.stats.failed')}</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="flex items-end">
        {/* GT-12440: html_spec 原型的重置按钮为纯文字（无 RotateCcw 图标）。 */}
        <Button variant="outline" data-testid="admin-audit-filter-reset" onClick={onReset}>
          {t('adminAudit.filter.reset')}
        </Button>
      </div>
    </div>
  );
}
