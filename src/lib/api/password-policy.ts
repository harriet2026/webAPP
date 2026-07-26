import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useApiRequest } from '@/lib/api/client';

export interface PasswordPolicySettings {
  minLength: number;
  minCharClasses: number;
  lengthTiers: number[];
  classTiers: number[];
}

export function usePasswordPolicySettings() {
  const { apiRequest } = useApiRequest();
  return useQuery({
    queryKey: ['security', 'password-policy'],
    queryFn: () => apiRequest<PasswordPolicySettings>('/security/password-policy'),
  });
}

export function useUpdatePasswordPolicySettings() {
  const { apiRequest } = useApiRequest();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { minLength: number; minCharClasses: number }) =>
      apiRequest<PasswordPolicySettings>('/security/password-policy', { method: 'PUT', body }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['security', 'password-policy'] }),
  });
}
