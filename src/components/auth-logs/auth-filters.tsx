'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { PROTOCOL_OPTIONS, SCENE_OPTIONS, FAIL_REASON_OPTIONS } from './constants';

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

// 文本输入的防抖提交间隔：demo（html_spec logs-auth-logs §2.3）没有搜索按钮、
// 条件即时生效；webapp 打的是真实后端，逐键触发查询会形成请求风暴，折中为
// 停顿 400ms 后提交（Enter 立即提交）。
const TEXT_DEBOUNCE_MS = 400;

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

  // 文本字段持本地草稿，防抖后提交给查询参数；下拉即时生效。
  // Reset 时父组件通过 key 重挂载本组件，草稿随之清空。
  const [draft, setDraft] = useState({
    keyword: values.keyword,
    domain: values.domain,
  });

  const commitNow = () => {
    if (draft.keyword !== values.keyword || draft.domain !== values.domain) {
      onChange({ keyword: draft.keyword, domain: draft.domain });
      onSearch();
    }
  };

  useEffect(() => {
    if (draft.keyword === values.keyword && draft.domain === values.domain) return;
    const timer = setTimeout(() => {
      onChange({ keyword: draft.keyword, domain: draft.domain });
      onSearch();
    }, TEXT_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [draft, values.keyword, values.domain, onChange, onSearch]);

  const onTextKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      commitNow();
    }
  };

  const selectChanged = (patch: Partial<AuthFilterValues>) => {
    onChange(patch);
    onSearch();
  };

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {showTenantFilter && (
          <div className="flex flex-col">
            <label className="mb-1.5 text-sm leading-none text-muted-foreground">{t('authAttempts.tenantScope')}</label>
            <Select
              value={values.tenantId || 'all'}
              onValueChange={(v) => selectChanged({ tenantId: (v == null || v === 'all') ? '' : v })}
            >
              <SelectTrigger className="h-10 w-full rounded-lg" data-testid="auth-filter-tenant">
                <SelectValue>{tenantLabel}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t('authAttempts.allTenants')}</SelectItem>
                {tenantOptions!.map((o) => (
                  <SelectItem key={o.id} value={String(o.id)}>
                    {o.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
        <div className="flex flex-col">
          <label className="mb-1.5 text-sm leading-none text-muted-foreground">{t('authAttempts.keywordLabel')}</label>
          <Input
            placeholder={t('authAttempts.keywordPlaceholder')}
            value={draft.keyword}
            onChange={(e) => setDraft((d) => ({ ...d, keyword: e.target.value }))}
            onKeyDown={onTextKeyDown}
            className="h-10 w-full rounded-lg"
            data-testid="auth-filter-keyword"
          />
        </div>
        <div className="flex flex-col">
          <label className="mb-1.5 text-sm leading-none text-muted-foreground">{t('authAttempts.authResult')}</label>
          <Select
            value={values.result || 'all'}
            onValueChange={(v) => selectChanged({ result: (v === 'all' || v == null) ? '' : (v as 'true' | 'false') })}
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
        </div>
        <div className="flex flex-col">
          <label className="mb-1.5 text-sm leading-none text-muted-foreground">{t('authAttempts.authProtocol')}</label>
          <Select
            value={values.authProtocol || 'all'}
            onValueChange={(v) => selectChanged({ authProtocol: (v == null || v === 'all') ? '' : v })}
          >
            <SelectTrigger className="h-10 w-full rounded-lg" data-testid="auth-filter-protocol">
              <SelectValue>{protocolLabel}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t('common.all')}</SelectItem>
              {PROTOCOL_OPTIONS.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>
                  {t(opt.labelKey)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex flex-col">
          <label className="mb-1.5 text-sm leading-none text-muted-foreground">{t('authAttempts.effectiveScene')}</label>
          <Select
            value={values.scene || 'all'}
            onValueChange={(v) => selectChanged({ scene: (v == null || v === 'all') ? '' : v })}
          >
            <SelectTrigger className="h-10 w-full rounded-lg" data-testid="auth-filter-scene">
              <SelectValue>{sceneLabel}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t('common.all')}</SelectItem>
              {SCENE_OPTIONS.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>
                  {t(opt.labelKey)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex flex-col">
          <label className="mb-1.5 text-sm leading-none text-muted-foreground">{t('authAttempts.domain')}</label>
          <Input
            placeholder={t('authAttempts.domainPlaceholder')}
            value={draft.domain}
            onChange={(e) => setDraft((d) => ({ ...d, domain: e.target.value }))}
            onKeyDown={onTextKeyDown}
            className="h-10 w-full rounded-lg"
            data-testid="auth-filter-domain"
          />
        </div>
        <div className="flex flex-col">
          <label className="mb-1.5 text-sm leading-none text-muted-foreground">{t('authAttempts.failureReason')}</label>
          <Select
            value={failReasonDisabled ? 'all' : (values.failReason || 'all')}
            onValueChange={(v) => selectChanged({ failReason: (v == null || v === 'all') ? '' : v })}
            disabled={failReasonDisabled}
          >
            <SelectTrigger className="h-10 w-full rounded-lg" data-testid="auth-filter-fail-reason">
              <SelectValue>{failReasonLabel}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t('common.all')}</SelectItem>
              {FAIL_REASON_OPTIONS.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>
                  {t(opt.labelKey)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className="flex justify-start gap-3">
        <Button variant="outline" onClick={onReset} className="h-10 px-6" data-testid="auth-filter-reset">{t('common.reset')}</Button>
      </div>
    </div>
  );
}
