'use client';

import { useTranslations } from 'next-intl';
import { useRouter } from '@/i18n/navigation';
import { Button } from '@/components/ui/button';

interface ExceptionRulesEntryProps {
  /** Count of currently-active exceptions for this module, shown next to the "view current" button.
   *  Undefined (default) while no lightweight count endpoint is wired — do not hardcode a fallback number. */
  count?: number;
  /** Optional override for "go to policy pipeline"; defaults to routing to the pipeline page. */
  onGoPipeline?: () => void;
  /** Optional handler for "view current exceptions"; unbound stub this round. */
  onViewCurrent?: () => void;
}

/**
 * Bottom entry block directing admins to manage exception rules centrally in the
 * Policy Pipeline instead of within this module (demo parity: exceptions are not
 * configured per-module here).
 */
export function ExceptionRulesEntry({ count, onGoPipeline, onViewCurrent }: ExceptionRulesEntryProps) {
  const t = useTranslations('authSpoofing');
  const router = useRouter();

  const handleGoPipeline = () => {
    if (onGoPipeline) {
      onGoPipeline();
      return;
    }
    router.push('/security/pipeline');
  };

  const viewCurrentLabel =
    typeof count === 'number' ? `${t('exceptionEntry.viewCurrent')}: ${count}` : t('exceptionEntry.viewCurrent');

  return (
    <div className="border-t pt-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-medium">{t('exceptionEntry.title')}</h3>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={handleGoPipeline}>
            {t('goToPipeline')}
          </Button>
          <Button variant="ghost" size="sm" onClick={onViewCurrent}>
            {viewCurrentLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}
