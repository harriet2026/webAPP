'use client';

import { useEffect, useCallback } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useQuery } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { Save, RotateCcw, Loader2, Shield, AlertTriangle, Clock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { FramedPage } from '@/components/shared/page-shell';
import { useApiRequest } from '@/lib/api/client';
import { localizeApiError, apiErrorFieldPath } from '@/lib/api/error-message';
import { getDisposalSettings, putDisposalSettings } from '@/lib/api/disposal-settings';
import { DISPOSAL_CATEGORY_KEYS, type DisposalSettings } from '@/types/disposal-settings';
import { disposalSettingsSchema, defaultDisposalSettings } from './schema';
import { QuarantineSettingsTab } from './quarantine-settings-tab';
import { ReviewSettingsTab } from './review-settings-tab';
import { RecallSettingsTab } from './recall-settings-tab';
import { getBrowserTz } from '@/lib/timezone';
import { useTenant } from '@/hooks/use-tenant';
import { useProductForm } from '@/contexts/product-form-context';
import { useAuth } from '@/contexts/auth-context';
import { useUnsavedGuard } from '@/contexts/unsaved-guard-context';

function normalizeTime(v: string): string {
  if (/^\d{2}:\d{2}$/.test(v)) return `${v}:00`;
  return v;
}

export function DisposalSettingsPage() {
  const t = useTranslations('disposalSettings');
  // 根命名空间实例：localizeApiError 需要用完整 key（apiErrors.<code>）查文案。
  const tRoot = useTranslations();
  const tCommon = useTranslations('common');
  const { apiRequest } = useApiRequest();
  const { effectiveTenantId } = useTenant();
  const { capabilities } = useProductForm();
  const { isSystemAdmin, demoAuthBypassEnabled } = useAuth();
  const { registerGuard, unregisterGuard } = useUnsavedGuard();
  // GT-12427: 多租户下「处置设置」是租户自有配置(registry platformHidden=true 已隐藏平台
  // 视角侧栏入口)。平台管理员未下钻到具体租户(effectiveTenantId===null)时,即便手贴 URL
  // 也拒绝渲染/取数,与同区兄弟模块 group-policy 一致;下钻进入某租户后按该租户身份正常配置。
  // Demo bypass 模式下底层账号仍是超管(isSystemAdmin=true)，但实际操作身份是租户管理员，
  // 不应触发平台视角 403，与 detailReadOnly 的修复逻辑保持一致。
  const platformWithoutTenant =
    !demoAuthBypassEnabled && !!capabilities?.multiTenant && isSystemAdmin && effectiveTenantId === null;

  const { data, isLoading } = useQuery({
    queryKey: ['disposal-settings', effectiveTenantId],
    queryFn: () => getDisposalSettings(apiRequest),
    enabled: !platformWithoutTenant,
  });

  const form = useForm<DisposalSettings>({
    resolver: zodResolver(disposalSettingsSchema),
    defaultValues: defaultDisposalSettings(),
  });

  useEffect(() => {
    form.reset(defaultDisposalSettings());
  }, [effectiveTenantId, form]);

  useEffect(() => {
    if (data) form.reset(data);
  }, [data, form]);

  const onSubmit = async (values: DisposalSettings) => {
    const browserTz = getBrowserTz();
    const pinnedTz =
      values.tz && values.tz.trim() !== '' ? values.tz : data?.server_tz || browserTz;
    const payload: DisposalSettings = {
      ...values,
      tz: pinnedTz,
      server_tz: undefined, // read-only; JSON.stringify drops undefined
      review: {
        ...values.review,
        reviewer_active_start: normalizeTime(values.review.reviewer_active_start),
        reviewer_active_end: normalizeTime(values.review.reviewer_active_end),
      },
    };
    try {
      const saved = await putDisposalSettings(payload, apiRequest);
      form.reset(saved);
      toast.success(t('saveSuccess'));
    } catch (e) {
      // GT-12606：后端现在返回**稳定错误码 + 结构化参数**，前端按 locale 渲染。
      // 此前这里是按英文 message 做子串匹配（portal_base_url / 分类键名两条），
      // 其余 27 条校验全部落到无差别的 t('saveFailed') —— 用户从"看不懂的英文"
      // 变成"看得懂但不知道错在哪"。子串匹配还有个致命问题：后端润色一个字就
      // 静默失配，且没有任何测试会红。
      //
      // 未命中错误码时才回退 t('saveFailed')，**绝不显示后端英文 message**
      // （上位规格 2026-07-28-cross-page-i18n-text-integrity-ui-spec.md §3 的
      // 发布门禁）。
      const localized = localizeApiError(e, tRoot);
      const fieldPath = apiErrorFieldPath(e);
      if (fieldPath) {
        // 把错误标注到具体输入框旁。message 存本地化后的文案，字段渲染层直接用。
        form.setError(fieldPath as Parameters<typeof form.setError>[0], {
          type: 'server',
          message: localized ?? undefined,
        });
      }
      toast.error(localized ?? t('saveFailed'));
    }
  };

  // GT-12251：校验失败时 handleSubmit 默认什么都不做，保存按钮看上去"没反应"。
  // 至少给一个明确的失败提示，具体字段错误由各 tab 就地渲染。
  const onInvalid = () => toast.error(t('saveValidationFailed'));

  // 供 UnsavedGuardDialog「保存后离开」选项调用：触发完整的 RHF 校验+提交流程。
  const saveForGuard = useCallback(
    () =>
      new Promise<void>((resolve, reject) => {
        form.handleSubmit(
          async (values) => {
            await onSubmit(values);
            resolve();
          },
          () => {
            // 校验失败：让 Promise reject，保持弹窗关闭但停留在页面
            toast.error(t('saveValidationFailed'));
            reject(new Error('validation'));
          },
        )();
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [form],
  );

  // 注册 / 更新 guard（随 isDirty 变化实时同步）
  const isDirty = form.formState.isDirty;
  useEffect(() => {
    registerGuard({ isDirty, onSave: isDirty ? saveForGuard : undefined });
    return () => {
      unregisterGuard();
    };
    // saveForGuard 依赖 form（稳定引用），isDirty 是基础类型，不会引起无限循环。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isDirty, saveForGuard]);

  // 浏览器关闭/刷新时的原生拦截
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (!form.formState.isDirty) return;
      e.preventDefault();
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [form]);

  const onReset = () => form.reset(defaultDisposalSettings());

  if (platformWithoutTenant) {
    return (
      <FramedPage
        title={t('pageTitle')}
        description={t('pageDescription')}
        data-testid="disposal-settings-page"
      >
        <div
          className="flex items-center justify-center min-h-[400px]"
          data-testid="disposal-settings-tenant-required"
        >
          <div className="text-center">
            <h1 className="text-2xl font-bold">403</h1>
            <p className="text-muted-foreground">{tCommon('accessDenied')}</p>
          </div>
        </div>
      </FramedPage>
    );
  }

  if (isLoading) {
    return (
      <FramedPage
        title={t('pageTitle')}
        description={t('pageDescription')}
        data-testid="disposal-settings-page"
      >
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      </FramedPage>
    );
  }

  const { control, watch, setValue } = form;

  return (
    <FramedPage
      title={t('pageTitle')}
      description={t('pageDescription')}
      data-testid="disposal-settings-page"
    >
      <form onSubmit={form.handleSubmit(onSubmit, onInvalid)}>
        <Tabs defaultValue="quarantine" data-testid="disposal-settings-tabs">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="quarantine" data-testid="disposal-settings-tab-quarantine" className="data-active:!bg-white data-active:!text-gray-900">
              <Shield className="mr-2 h-4 w-4" />
              {t('tabQuarantine')}
            </TabsTrigger>
            <TabsTrigger value="review" data-testid="disposal-settings-tab-review" className="data-active:!bg-white data-active:!text-gray-900">
              <AlertTriangle className="mr-2 h-4 w-4" />
              {t('tabReview')}
            </TabsTrigger>
            <TabsTrigger value="recall" data-testid="disposal-settings-tab-recall" className="data-active:!bg-white data-active:!text-gray-900">
              <Clock className="mr-2 h-4 w-4" />
              {t('tabRecall')}
            </TabsTrigger>
          </TabsList>
          <TabsContent value="quarantine" className="mt-6">
            <QuarantineSettingsTab
              key={effectiveTenantId ?? 'single'}
              control={control}
              watch={watch}
              setValue={setValue}
              serverTz={data?.server_tz ?? ''}
            />
          </TabsContent>
          <TabsContent value="review" className="mt-6">
            <ReviewSettingsTab control={control} watch={watch} setValue={setValue} />
          </TabsContent>
          <TabsContent value="recall" className="mt-6">
            <RecallSettingsTab control={control} watch={watch} setValue={setValue} />
          </TabsContent>
        </Tabs>
        <div className="sticky bottom-0 z-10 mt-6 flex justify-end gap-2 border-t bg-background/95 px-1 py-3 backdrop-blur-sm">
          <Button
            type="button"
            variant="outline"
            data-testid="disposal-settings-reset"
            onClick={onReset}
          >
            <RotateCcw className="mr-2 h-4 w-4" />
            {t('reset')}
          </Button>
          <Button
            type="submit"
            data-testid="disposal-settings-save"
            disabled={form.formState.isSubmitting}
          >
            {form.formState.isSubmitting ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Save className="mr-2 h-4 w-4" />
            )}
            {t('save')}
          </Button>
        </div>
      </form>
    </FramedPage>
  );
}
