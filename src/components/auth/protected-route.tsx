'use client';

import { useAuth } from '@/contexts/auth-context';
import { useRouter, usePathname } from 'next/navigation';
import { useEffect } from 'react';
import { Loading } from '@/components/shared/loading';
import type { Permission } from '@/contexts/auth-context';
import { useTranslations } from 'next-intl';

interface ProtectedRouteProps {
  children: React.ReactNode;
  requiredPermission?: Permission;
}

export function ProtectedRoute({ children, requiredPermission }: ProtectedRouteProps) {
  const { user, isLoading, hasPermission } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const t = useTranslations();

  useEffect(() => {
    if (!isLoading && !user) {
      const locale = pathname.split('/')[1] || 'zh';
      router.push(`/${locale}/login`);
    }
  }, [user, isLoading, router, pathname]);

  if (isLoading) {
    return <Loading />;
  }

  if (!user) {
    return null;
  }

  if (requiredPermission && !hasPermission(requiredPermission)) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <h1 className="text-2xl font-bold">403</h1>
          <p className="text-muted-foreground">{t('common.accessDenied')}</p>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
