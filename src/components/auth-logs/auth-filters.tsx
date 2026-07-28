'use client';

import { useTranslations } from 'next-intl';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { PROTOCOL_OPTIONS, SCENE_OPTIONS, FAIL_REASON_OPTIONS } from './constants';
import {
  SearchFilterPanel,
  type SearchFilterCondition,
} from '@/components/shared/search-filter-panel';

export interface AuthFilterValues {
  keyword: string;
  domain: string;
  result: '' | 'true' | 'false';
  authProtocol: string;
  scene: string;
  failReason: string;
  // GT-12367：平台管理员的「租户范围」筛选（''=全部租户）。仅平台视角有值/可选。
  tenantId: string;
}

interface AuthFiltersProps {
  values: AuthFilterValues;
  onChange: (patch: Partial<AuthFilterValues>) => void;
  onSearch: () => void;
  onReset: () => void;
  // GT-12367：平台管理员专属的租户下拉选项；非空才渲染「租户范围」筛选。
  // 这是页面*内*的独立筛选控件，不复用顶部 dev-only 全局租户选择器。
  tenantOptions?: { id: number; name: string }[];
}

export function AuthFilters({ values, onChange, onSearch, onReset, tenantOptions }: AuthFiltersProps) {
  const t = useTranslations();

  const failReasonDisabled = values.result === 'true';
  const showTenantFilter = !!tenantOptions && tenantOptions.length > 0;
  const tenantLabel = (v: string) => {
    if (!v) return t('authAttempts.allTenants');
    const hit = tenantOptions?.find((o) => String(o.id) === v);
    return hit ? hit.name : t('authAttempts.allTenants');
  };

  // Base UI 的 <Select.Value> 默认渲染原始 value，需要 formatter 才显示本地化文案。
  const optionLabel = (opts: { value: string; labelKey: string }[]) => (v: string) => {
    const hit = opts.find((o) => o.value === v);
    return hit ? t(hit.labelKey) : t('common.all');
  };
  const protocolLabel = optionLabel(PROTOCOL_OPTIONS);
  const sceneLabel = optionLabel(SCENE_OPTIONS);
  const failReasonLabel = optionLabel(FAIL_REASON_OPTIONS);

  const conditions: SearchFilterCondition[] = [
    ...(showTenantFilter
      ? [{
          key: 'tenant',
          label: t('authAttempts.tenantScope'),
          control: (
            <Select
              value={values.tenantId || 'all'}
              onValueChange={(v) => onChange({ tenantId: (v == null || v === 'all') ? '' : v })}
            >
              <SelectTrigger className="h-10 w-full rounded-lg" data-testid="auth-filter-tenant">
                <SelectValue>{tenantLabel}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t('authAttempts.allTenants')}</SelectItem>
                {tenantOptions!.map((option) => (
                  <SelectItem key={option.id} value={String(option.id)}>
                    {option.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ),
        }]
      : []),
    {
      key: 'keyword',
      label: t('authAttempts.keywordLabel'),
      control: (
        <Input
          placeholder={t('authAttempts.keywordPlaceholder')}
          value={values.keyword}
          onChange={(e) => onChange({ keyword: e.target.value })}
          className="h-10 w-full rounded-lg"
          data-testid="auth-filter-keyword"
        />
      ),
    },
    {
      key: 'result',
      label: t('authAttempts.authResult'),
      control: (
        <Select
          value={values.result || 'all'}
          onValueChange={(v) => onChange({ result: (v === 'all' || v == null) ? '' : (v as 'true' | 'false') })}
        >
          <SelectTrigger className="h-10 w-full rounded-lg" data-testid="auth-filter-result">
            <SelectValue>{(v: string) => (v === 'true' ? t('authAttempts.success') : v === 'false' ? t('authAttempts.failed') : t('common.all'))}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t('common.all')}</SelectItem>
            <SelectItem value="true">{t('authAttempts.success')}</SelectItem>
            <SelectItem value="false">{t('authAttempts.failed')}</SelectItem>
          </SelectContent>
        </Select>
      ),
    },
    {
      key: 'protocol',
      label: t('authAttempts.authProtocol'),
      control: (
        <Select
          value={values.authProtocol || 'all'}
          onValueChange={(v) => onChange({ authProtocol: (v == null || v === 'all') ? '' : v })}
        >
          <SelectTrigger className="h-10 w-full rounded-lg" data-testid="auth-filter-protocol">
            <SelectValue>{protocolLabel}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t('common.all')}</SelectItem>
            {PROTOCOL_OPTIONS.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {t(option.labelKey)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      ),
    },
    {
      key: 'scene',
      label: t('authAttempts.effectiveScene'),
      control: (
        <Select
          value={values.scene || 'all'}
          onValueChange={(v) => onChange({ scene: (v == null || v === 'all') ? '' : v })}
        >
          <SelectTrigger className="h-10 w-full rounded-lg" data-testid="auth-filter-scene">
            <SelectValue>{sceneLabel}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t('common.all')}</SelectItem>
            {SCENE_OPTIONS.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {t(option.labelKey)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      ),
    },
    {
      key: 'domain',
      label: t('authAttempts.domain'),
      control: (
        <Input
          placeholder={t('authAttempts.domainPlaceholder')}
          value={values.domain}
          onChange={(e) => onChange({ domain: e.target.value })}
          className="h-10 w-full rounded-lg"
          data-testid="auth-filter-domain"
        />
      ),
    },
    {
      key: 'fail-reason',
      label: t('authAttempts.failureReason'),
      control: (
        <Select
          value={failReasonDisabled ? 'all' : (values.failReason || 'all')}
          onValueChange={(v) => onChange({ failReason: (v == null || v === 'all') ? '' : v })}
          disabled={failReasonDisabled}
        >
          <SelectTrigger className="h-10 w-full rounded-lg" data-testid="auth-filter-fail-reason">
            <SelectValue>{failReasonLabel}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t('common.all')}</SelectItem>
            {FAIL_REASON_OPTIONS.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {t(option.labelKey)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      ),
    },
  ];

  return (
    <SearchFilterPanel
      contentClassName="space-y-6"
      conditions={conditions}
      conditionGridClassName="sm:grid-cols-2 lg:grid-cols-3"
      conditionClassName="flex flex-col space-y-0"
      labelClassName="mb-1.5 text-sm leading-none"
      actionsPlacement="footer"
      actionsClassName="justify-start gap-3"
      onSearch={onSearch}
      onReset={onReset}
      searchLabel={t('common.search')}
      resetLabel={t('common.reset')}
      searchTestId="auth-filter-search"
      resetTestId="auth-filter-reset"
      searchButtonClassName="h-10 px-6"
      resetButtonClassName="h-10 px-6"
    />
  );
}
