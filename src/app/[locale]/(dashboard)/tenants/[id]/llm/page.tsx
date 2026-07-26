'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft, Loader2, Save, Trash2, Bot } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { toast } from 'sonner';
import {
  getTenant,
  getTenantLLMSetting,
  upsertTenantLLMSetting,
  deleteTenantLLMSetting,
} from '@/lib/api/tenants';
import { PageHeader, PageShell, PageSurface } from '@/components/shared/page-shell';
import { AccessDeniedPanel, LoadingPanel } from '@/components/shared/state-panel';
import { ConfirmDialog } from '@/components/shared/confirm-dialog';
import { usePermission } from '@/hooks/use-permission';

const llmSchema = z.object({
  base_url: z.string().min(1, 'valueRequired'),
  model: z.string().min(1, 'valueRequired'),
	  api_key: z.string().min(1, 'valueRequired'),
	  enabled: z.boolean(),
	  insecure_skip_verify: z.boolean(),
	});

type LLMForm = z.infer<typeof llmSchema>;

export default function TenantLLMPage() {
  const t = useTranslations();
  const params = useParams();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { canManageTenants } = usePermission();

  const tenantId = Number(params.id);
  const [showDelete, setShowDelete] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [initialized, setInitialized] = useState(false);

  const { data: tenant } = useQuery({
    queryKey: ['tenant', tenantId],
    queryFn: () => getTenant(tenantId),
    enabled: !!tenantId,
  });

  const { data: setting, isLoading } = useQuery({
    queryKey: ['tenant-llm', tenantId],
    queryFn: () => getTenantLLMSetting(tenantId),
    enabled: !!tenantId,
  });

  const form = useForm<LLMForm>({
    resolver: zodResolver(llmSchema),
    defaultValues: {
      base_url: '',
      model: '',
	      api_key: '',
	      enabled: true,
	      insecure_skip_verify: false,
	    },
	  });

  useEffect(() => {
    if (setting && !initialized) {
      form.reset({
        base_url: setting.base_url,
        model: setting.model,
	        api_key: '••••••••',
	        enabled: setting.enabled,
	        insecure_skip_verify: setting.insecure_skip_verify,
	      });
      setInitialized(true);
    }
  }, [setting, initialized, form]);

  const handleSubmit = async (data: LLMForm) => {
    setIsSubmitting(true);
    try {
      // GT-11771 P2: when editing, the api_key field is initialized to a
      // mask placeholder ('••••••••'). If the user submits without changing
      // it, don't send the mask - the backend would store the literal mask
      // and LLM auth would break. Omit api_key so the backend keeps the
      // existing key (treats it as 'no change to this field').
      const payload = initialized && data.api_key === '••••••••'
        ? (() => { const { api_key: _unused, ...rest } = data; return rest; })()
        : data;
      await upsertTenantLLMSetting(tenantId, payload);
      queryClient.invalidateQueries({ queryKey: ['tenant-llm', tenantId] });
      toast.success(t('common.updateSuccess'));
    } catch {
      toast.error(t('common.error'));
    } finally {
      setIsSubmitting(false);
    }
  };

  const deleteMutation = useMutation({
    mutationFn: () => deleteTenantLLMSetting(tenantId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tenant-llm', tenantId] });
	      form.reset({ base_url: '', model: '', api_key: '', enabled: true, insecure_skip_verify: false });
      setInitialized(false);
      toast.success(t('common.deleteSuccess'));
      setShowDelete(false);
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });

  if (!canManageTenants) {
    return <AccessDeniedPanel description={t('common.accessDenied')} />;
  }

  if (isLoading) {
    return (
      <PageShell>
        <LoadingPanel />
      </PageShell>
    );
  }

  return (
    <PageShell>
      <PageHeader
        eyebrow={t('tenants.llmSettings')}
        title={t('tenants.llmSettings')}
        description={tenant ? tenant.name : ''}
        actions={
          <Button variant="outline" size="icon" onClick={() => router.push('./..')}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
        }
      />

      <PageSurface>
        <div className="max-w-2xl">
          <div className="flex items-center gap-3 mb-6">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10">
              <Bot className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h3 className="font-semibold">{t('tenants.llmConfig')}</h3>
              <p className="text-sm text-muted-foreground">{t('tenants.llmConfigDesc')}</p>
            </div>
          </div>

          <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-6">
            <div className="flex items-center justify-between rounded-lg border p-4">
              <div className="space-y-0.5">
                <Label className="text-base">{t('common.enabled')}</Label>
                <p className="text-sm text-muted-foreground">{t('tenants.llmEnabledDesc')}</p>
              </div>
              <Switch
                checked={form.watch('enabled')}
                onCheckedChange={(v) => form.setValue('enabled', v, { shouldDirty: true })}
              />
            </div>

            <div className="space-y-2">
              <Label>{t('tenants.llmBaseUrl')} *</Label>
              <Input
                {...form.register('base_url')}
                placeholder="https://api.openai.com/v1"
              />
              <p className="text-xs text-muted-foreground">{t('tenants.llmBaseUrlDesc')}</p>
            </div>

            <div className="space-y-2">
              <Label>{t('tenants.llmModel')} *</Label>
              <Input
                {...form.register('model')}
                placeholder="gpt-4o"
              />
            </div>

            <div className="space-y-2">
              <Label>{t('tenants.llmApiKey')} *</Label>
              <Input
                {...form.register('api_key')}
                type="password"
                placeholder={setting ? '••••••••' : 'sk-...'}
              />
              <p className="text-xs text-muted-foreground">{t('tenants.llmApiKeyDesc')}</p>
            </div>

            <div className="flex items-center justify-between rounded-md border px-3 py-3">
              <div className="space-y-1">
                <Label>{t('tenants.insecureSkipVerify')}</Label>
                <p className="text-xs text-muted-foreground">{t('tenants.insecureSkipVerifyDesc')}</p>
              </div>
              <Switch
                checked={form.watch('insecure_skip_verify')}
                onCheckedChange={(v) => form.setValue('insecure_skip_verify', v, { shouldDirty: true })}
              />
            </div>

            <div className="flex items-center justify-between pt-4 border-t">
              <div>
                {setting && (
                  <Button
                    type="button"
                    variant="outline"
                    className="text-destructive"
                    onClick={() => setShowDelete(true)}
                  >
                    <Trash2 className="h-4 w-4 mr-2" />
                    {t('common.delete')}
                  </Button>
                )}
              </div>
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                ) : (
                  <Save className="h-4 w-4 mr-2" />
                )}
                {t('common.save')}
              </Button>
            </div>
          </form>
        </div>
      </PageSurface>

      <ConfirmDialog
        open={showDelete}
        onOpenChange={setShowDelete}
        title={t('tenants.deleteLLM')}
        description={t('tenants.deleteLLMDesc')}
        onConfirm={() => deleteMutation.mutate()}
        variant="destructive"
      />
    </PageShell>
  );
}
