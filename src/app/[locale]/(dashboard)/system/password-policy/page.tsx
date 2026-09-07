'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { Save, Loader2 } from 'lucide-react';
import { usePermission } from '@/hooks/use-permission';
import { usePasswordPolicySettings, useUpdatePasswordPolicySettings } from '@/lib/api/password-policy';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { PageHeader, PageShell, PageSurface } from '@/components/shared/page-shell';
import { AccessDeniedPanel, LoadingPanel } from '@/components/shared/state-panel';
import { useApiErrorMessage } from '@/lib/api/use-api-error-message';

export default function PasswordPolicyPage() {
  const t = useTranslations();
  const apiErrorMessage = useApiErrorMessage();
  const { isSystemAdmin } = usePermission();
  const { data, isLoading } = usePasswordPolicySettings();
  const update = useUpdatePasswordPolicySettings();
  const [minLengthOverride, setMinLengthOverride] = useState<number | null>(null);
  const [minCharClassesOverride, setMinCharClassesOverride] = useState<number | null>(null);
  const minLength = minLengthOverride ?? data?.minLength ?? null;
  const minCharClasses = minCharClassesOverride ?? data?.minCharClasses ?? null;

  if (!isSystemAdmin) {
    return <AccessDeniedPanel description={t('common.accessDenied')} />;
  }

  const onSave = () => {
    if (minLength === null || minCharClasses === null) return;
    update.mutate(
      { minLength, minCharClasses },
      {
        onSuccess: () => toast.success(t('common.save')),
        onError: (e) => toast.error(apiErrorMessage(e, t('common.save'))),
      }
    );
  };

  return (
    <PageShell>
      <PageHeader
        title={t('passwordPolicy.title')}
        actions={
          <Button
            type="button"
            data-testid="password-policy-save"
            onClick={onSave}
            disabled={update.isPending || isLoading || minLength === null || minCharClasses === null}
          >
            {update.isPending ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Save className="mr-2 h-4 w-4" />
            )}
            {t('common.save')}
          </Button>
        }
      />

      {isLoading || !data || minLength === null || minCharClasses === null ? (
        <LoadingPanel />
      ) : (
        <PageSurface>
          <div className="max-w-md space-y-4">
            <label className="block space-y-1">
              <span className="text-sm font-medium">{t('passwordPolicy.minLength')}</span>
              <Select value={String(minLength)} onValueChange={(v) => setMinLengthOverride(Number(v))}>
                <SelectTrigger data-testid="password-policy-min-length">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {data.lengthTiers.map((n) => (
                    <SelectItem key={n} value={String(n)} data-testid={`password-policy-min-length-option-${n}`}>
                      {n}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </label>
            <label className="block space-y-1">
              <span className="text-sm font-medium">{t('passwordPolicy.minCharClasses')}</span>
              <Select value={String(minCharClasses)} onValueChange={(v) => setMinCharClassesOverride(Number(v))}>
                <SelectTrigger data-testid="password-policy-min-char-classes">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {data.classTiers.map((n) => (
                    <SelectItem key={n} value={String(n)} data-testid={`password-policy-min-char-classes-option-${n}`}>
                      {n}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <span className="text-xs text-muted-foreground">{t('passwordPolicy.classesHint')}</span>
            </label>
          </div>
        </PageSurface>
      )}
    </PageShell>
  );
}
