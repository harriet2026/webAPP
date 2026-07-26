'use client';

import { useEffect } from 'react';
import { useTranslations, useLocale } from 'next-intl';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { PageHeader, PageShell } from '@/components/shared/page-shell';
import { AccessDeniedPanel } from '@/components/shared/state-panel';
import { useAuth } from '@/contexts/auth-context';
import { useProductForm } from '@/contexts/product-form-context';
import { useApiRequest } from '@/lib/api/client';
import { getRoutingScope } from '@/lib/api/mail-routing';
import { MailRoutingShell } from '@/components/mail-routing/mail-routing-shell';

export default function MailRoutingPage() {
  const t = useTranslations('mailRouting');
  const locale = useLocale();
  const router = useRouter();
  const { capabilities } = useProductForm();
  const { apiRequest } = useApiRequest();
  const { isSystemAdmin } = useAuth();

  const { data: scope, isLoading } = useQuery({
    queryKey: ['routing-scope'],
    queryFn: () => getRoutingScope(apiRequest),
  });

  const isMultiTenant = !!capabilities?.multiTenant;

  // Multi-tenant forms have no standalone mail-routing page (spec §3.2): redirect
  // to the tenant center, where the drill-down lives, instead of rendering an
  // in-place AccessDeniedPanel (review M18).
  useEffect(() => {
    if (isMultiTenant) {
      router.replace(`/${locale}/tenants`);
    }
  }, [isMultiTenant, router, locale]);

  // Mail routing is system_admin only in every form (spec §3.2). GT-12329:
  // stated positively (require system_admin) rather than as "deny tenant_admin",
  // so any future role that is neither is denied by default instead of silently
  // admitted.
  if (!isSystemAdmin) {
    return <AccessDeniedPanel description={t('title')} />;
  }

  // Multi-tenant: redirecting (effect above). Render nothing meanwhile so the
  // Shell never flashes a frame (review M18). Also gate on capabilities being
  // loaded: while capabilities===null we cannot yet decide single vs multi, so
  // hold rather than flash the Shell.
  if (isMultiTenant || capabilities === null) {
    return null;
  }

  // GT-12330: the Shell's tabs inject X-Tenant-ID from the explicit tenantId
  // prop (useScopedApiRequest), so we no longer route the resolved tenant
  // through the global auth context. That removes the old first-load race
  // (review B1) AND the collision with the platform-view reconciliation
  // (GT-12245), which used to clear the global selection right back to null.
  // Render the Shell as soon as the scope is resolved.
  return (
    <PageShell>
      <PageHeader title={t('title')} description={t('subtitle')} />
      {!isLoading && scope?.tenant_id ? (
        <MailRoutingShell tenantId={scope.tenant_id} />
      ) : null}
    </PageShell>
  );
}
