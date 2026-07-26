'use client';

import { Button } from '@/components/ui/button';
import { useTranslations } from 'next-intl';

export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const t = useTranslations();

  return (
    <div className="flex flex-col items-center justify-center min-h-[50vh] gap-4">
      <h2 className="text-xl font-semibold text-destructive">
        {t('common.error')}
      </h2>
      <p className="text-muted-foreground text-sm max-w-md text-center">
        {error.message || t('common.errorMessage')}
      </p>
      <Button onClick={reset} variant="outline">
        {t('common.retry')}
      </Button>
    </div>
  );
}
