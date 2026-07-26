'use client';

import { useRouter } from '@/i18n/navigation';
import { useAuth } from '@/contexts/auth-context';
import { useProductForm } from '@/contexts/product-form-context';

export function useImpersonate() {
  const router = useRouter();
  const { setSelectedTenant } = useAuth();
  const { setViewer } = useProductForm();
  return (tenantId: number) => {
    setSelectedTenant(tenantId); // writes osg_selected_tenant cookie (Spec 1 §8)
    setViewer('tenant'); // writes osg_viewer cookie
    router.push('/dashboard'); // re-fetch bootstrap → grants for the tenant
  };
}
