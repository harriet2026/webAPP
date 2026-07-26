'use client';

import { useTranslations } from 'next-intl';
import { PasswordBookTable } from './PasswordBookTable';

export function PasswordBookPage() {
  const t = useTranslations('passwordBook');

  return (
    <div className="space-y-6 p-6" data-testid="password-book-page">
      <div>
        <h2 className="text-2xl font-semibold tracking-tight">{t('title')}</h2>
        <p className="text-muted-foreground mt-1">{t('description')}</p>
      </div>
      <PasswordBookTable />
    </div>
  );
}
