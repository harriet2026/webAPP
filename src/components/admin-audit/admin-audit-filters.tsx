'use client';

import { useMemo } from 'react';
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
import { OP_TYPE_META, AUDIT_MODULE_GROUPS, filterVisibleModuleGroups } from './admin-audit-taxonomy';
import { useAuth } from '@/contexts/auth-context';
import { useProductForm } from '@/contexts/product-form-context';
import { visibleNavIds, isNavItemAllowed } from '@/components/layout/sidebar-visibility';
import {
  SearchFilterPanel,
  type SearchFilterCondition,
} from '@/components/shared/search-filter-panel';

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
  onSearch: () => void;
  onReset: () => void;
  showTenant?: boolean;
  tenants?: TenantOption[];
}

export function AdminAuditFilters({
  value,
  onChange,
  onSearch,
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
  const conditions: SearchFilterCondition[] = [
    ...(showTenant
      ? [{
          key: 'tenant',
          label: t('adminAudit.filter.tenant'),
          control: (
            <Select
              items={tenantItems}
              value={value.tenant}
              onValueChange={(next) => onChange({ ...value, tenant: next ?? '' })}
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
          ),
        }]
      : []),
    {
      key: 'keyword',
      label: t('adminAudit.filter.keyword'),
      control: (
        <Input
          data-testid="admin-audit-filter-keyword"
          placeholder={t('adminAudit.filter.keyword')}
          value={value.keyword}
          onChange={(event) => onChange({ ...value, keyword: event.target.value })}
        />
      ),
    },
    {
      key: 'module',
      label: t('adminAudit.filter.module'),
      control: (
        <Select
          items={moduleItems}
          value={value.module}
          onValueChange={(next) => onChange({ ...value, module: next ?? '' })}
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
      ),
    },
    {
      key: 'op-type',
      label: t('adminAudit.filter.opType'),
      control: (
        <Select
          items={opTypeItems}
          value={value.opType}
          onValueChange={(next) => onChange({ ...value, opType: next ?? '' })}
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
      ),
    },
    {
      key: 'result',
      label: t('adminAudit.filter.result'),
      control: (
        <Select
          items={resultItems}
          value={value.result}
          onValueChange={(next) => onChange({ ...value, result: next ?? '' })}
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
      ),
    },
  ];

  return (
    <SearchFilterPanel
      testId="admin-audit-filters"
      conditions={conditions}
      conditionGridClassName="gap-3 sm:grid-cols-2 lg:grid-cols-3"
      conditionClassName="flex flex-col gap-1.5 space-y-0"
      labelClassName="text-sm leading-none"
      actionsPlacement="grid"
      onSearch={onSearch}
      onReset={onReset}
      searchLabel={t('common.search')}
      resetLabel={t('adminAudit.filter.reset')}
      searchTestId="admin-audit-filter-search"
      resetTestId="admin-audit-filter-reset"
    />
  );
}
