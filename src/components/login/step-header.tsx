'use client';

import { ArrowLeft } from 'lucide-react';
import { useTranslations } from 'next-intl';

export interface StepHeaderProps {
  title: string;
  description?: React.ReactNode;
  onBack?: () => void;
  backDisabled?: boolean;
}

/**
 * StepHeader — the shared "← 返回 / h2 / 描述" block every non-credentials
 * login step opens with. Replaces the per-step muted hint box.
 */
export function StepHeader({ title, description, onBack, backDisabled }: StepHeaderProps) {
  const t = useTranslations();
  return (
    <div className="space-y-4">
      {onBack && (
        <button
          type="button"
          onClick={onBack}
          disabled={backDisabled}
          className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground disabled:opacity-50"
        >
          <ArrowLeft className="h-4 w-4" />
          {t('auth.back')}
        </button>
      )}
      <div className="space-y-1">
        <h2 className="text-lg font-semibold text-foreground">{title}</h2>
        {description ? <p className="text-sm text-muted-foreground">{description}</p> : null}
      </div>
    </div>
  );
}
