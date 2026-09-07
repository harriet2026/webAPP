import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  apiRequest,
  isPublicationPendingResponse,
  useApiRequest,
  type ApiRequestFn,
  type ConfigMutationResult,
} from '@/lib/api/client';

export interface PasswordPolicySettings {
  minLength: number;
  minCharClasses: number;
  lengthTiers: number[];
  classTiers: number[];
}

export interface PasswordPolicyWrite {
  minLength: number;
  minCharClasses: number;
}

export function putPasswordPolicySettings(
  body: PasswordPolicyWrite,
  requestFn: ApiRequestFn = apiRequest,
): Promise<ConfigMutationResult<PasswordPolicySettings>> {
  return requestFn<ConfigMutationResult<PasswordPolicySettings>>('/security/password-policy', {
    method: 'PUT',
    body,
  });
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
    mutationFn: (body: PasswordPolicyWrite) => putPasswordPolicySettings(body, apiRequest),
    onSuccess: (result, body) => {
      const queryKey = ['security', 'password-policy'] as const;
      if (isPublicationPendingResponse(result)) {
        qc.setQueryData<PasswordPolicySettings | undefined>(queryKey, (current) =>
          current ? { ...current, ...body } : current,
        );
      } else {
        qc.setQueryData(queryKey, result);
      }
    },
  });
}
