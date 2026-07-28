'use client';

import { useLocale, useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/auth-context';

/**
 * Low-profile demo entrance for explicitly opted-in development deployments.
 * The server-provided flag is authoritative; production builds render nothing.
 */
export function DemoLoginEntry() {
  const t = useTranslations();
  const locale = useLocale();
  const router = useRouter();
  const { demoAuthBypassEnabled, startDemoSession } = useAuth();

  if (!demoAuthBypassEnabled) return null;

  return (
    <div className="mt-5 text-center">
      <button
        type="button"
        data-testid="demo-login-entry"
        className="rounded-sm px-2 py-1 text-xs text-muted-foreground/50 transition-colors hover:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        onClick={() => {
          startDemoSession();
          router.replace(`/${locale}/dashboard`);
        }}
      >
        {t('auth.demoEntry')}
      </button>
    </div>
  );
}
