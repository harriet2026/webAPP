'use client';

import { useEffect } from 'react';
import { useOptionalUnsavedGuard } from '@/contexts/unsaved-guard-context';

export function useUnsavedDraftRegistration(active: boolean, dirty: boolean) {
  const guard = useOptionalUnsavedGuard();
  const registerGuard = guard?.registerGuard;
  const unregisterGuard = guard?.unregisterGuard;

  useEffect(() => {
    if (!active || !registerGuard || !unregisterGuard) return;
    registerGuard({ isDirty: dirty });
    return unregisterGuard;
  }, [active, dirty, registerGuard, unregisterGuard]);
}
