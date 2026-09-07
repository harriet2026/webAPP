'use client';

import { useRouter } from '@/i18n/navigation';
import { useAuth } from '@/contexts/auth-context';
import { useProductForm } from '@/contexts/product-form-context';
import { useOptionalUnsavedGuard } from '@/contexts/unsaved-guard-context';

export function useImpersonate() {
  const router = useRouter();
  const { setSelectedTenant } = useAuth();
  const { setViewer } = useProductForm();
  const unsavedGuard = useOptionalUnsavedGuard();
  return (tenantId: number) => {
    const transition = () => {
      setSelectedTenant(tenantId); // writes osg_selected_tenant cookie (Spec 1 §8)
      setViewer('tenant'); // writes osg_viewer cookie
      router.push('/dashboard'); // re-fetch bootstrap → grants for the tenant
    };
    if (unsavedGuard) {
      unsavedGuard.requestTransition(transition);
    } else {
      transition();
    }
  };
}
