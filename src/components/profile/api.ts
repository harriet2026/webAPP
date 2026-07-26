import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useApiRequest } from '@/lib/api/client';
import type {
  AccountInfo,
  SecurityPolicy,
  TwoFactorConfig,
  DevicesResponse,
  AdminTrustedDevice,
  PaginatedLogins,
  ChangePasswordResult,
  LogoutOthersResult,
  TwoFactorMethod,
  ContactType,
  CodePurpose,
  CodeMethod,
} from './types';

function buildQS(params: Record<string, unknown>): string {
  const qs = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') {
      qs.set(key, String(value));
    }
  });
  const s = qs.toString();
  return s ? `?${s}` : '';
}

export interface LoginHistoryParams {
  start?: string;
  end?: string;
  page: number;
  page_size: number;
}

export function useAccount() {
  const { apiRequest } = useApiRequest();
  return useQuery({
    queryKey: ['profile', 'account'],
    queryFn: () => apiRequest<AccountInfo>('/profile/account'),
  });
}

export function useUpdateName() {
  const { apiRequest } = useApiRequest();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (name: string) =>
      apiRequest('/profile/account', { method: 'PUT', body: { name } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['profile', 'account'] }),
  });
}

export function useSecurityPolicy() {
  const { apiRequest } = useApiRequest();
  return useQuery({
    queryKey: ['profile', 'policy'],
    queryFn: () => apiRequest<SecurityPolicy>('/profile/security-policy'),
  });
}

export function useSendCode() {
  const { apiRequest } = useApiRequest();
  return useMutation({
    mutationFn: (body: { purpose: CodePurpose; target: string; method: CodeMethod }) =>
      apiRequest('/profile/code', { method: 'POST', body }),
  });
}

export function useBindContact() {
  const { apiRequest } = useApiRequest();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { type: ContactType; target: string; code: string }) =>
      apiRequest('/profile/contact/bind', { method: 'POST', body }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['profile', 'account'] }),
  });
}

export function useChangePassword() {
  const { apiRequest } = useApiRequest();
  return useMutation({
    mutationFn: (body: { current_password: string; new_password: string }) =>
      apiRequest<ChangePasswordResult>('/auth/password', { method: 'PUT', body }),
  });
}

export function use2FA() {
  const { apiRequest } = useApiRequest();
  return useQuery({
    queryKey: ['profile', '2fa'],
    queryFn: () => apiRequest<TwoFactorConfig>('/profile/2fa'),
  });
}

export function useEnable2FA() {
  const { apiRequest } = useApiRequest();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { method: TwoFactorMethod; target: string; code: string }) =>
      apiRequest('/profile/2fa', { method: 'PUT', body }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['profile', '2fa'] });
      qc.invalidateQueries({ queryKey: ['profile', 'account'] });
    },
  });
}

export function useDisable2FA() {
  const { apiRequest } = useApiRequest();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { enabled: false; password: string }) =>
      apiRequest('/profile/2fa/status', { method: 'PUT', body }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['profile', '2fa'] }),
  });
}

export function useDevices() {
  const { apiRequest } = useApiRequest();
  return useQuery({
    queryKey: ['profile', 'devices'],
    queryFn: () => apiRequest<DevicesResponse>('/profile/devices'),
  });
}

export function useLogoutDevice() {
  const { apiRequest } = useApiRequest();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (jti: string) =>
      apiRequest(`/profile/devices/${encodeURIComponent(jti)}/logout`, { method: 'POST' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['profile', 'devices'] }),
  });
}

export function useLogoutOthers() {
  const { apiRequest } = useApiRequest();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () =>
      apiRequest<LogoutOthersResult>('/profile/devices/bulk', {
        method: 'POST',
        body: { action: 'logout_others' },
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['profile', 'devices'] }),
  });
}

// Trusted devices (Spec §1.5): long-lived "trust this device" cookies that
// skip 2FA on future logins. Distinct from sessions (/profile/devices).
export function useTrustedDevices() {
  const { apiRequest } = useApiRequest();
  return useQuery({
    queryKey: ['profile', 'trusted-devices'],
    queryFn: () => apiRequest<{ items: AdminTrustedDevice[] }>('/profile/trusted-devices'),
  });
}

export function useRevokeTrustedDevice() {
  const { apiRequest } = useApiRequest();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) =>
      apiRequest(`/profile/trusted-devices/${encodeURIComponent(id)}`, { method: 'DELETE' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['profile', 'trusted-devices'] }),
  });
}

export function useLoginHistory(params: LoginHistoryParams) {
  const { apiRequest } = useApiRequest();
  return useQuery({
    queryKey: ['profile', 'history', params],
    queryFn: () =>
      apiRequest<PaginatedLogins>(
        `/profile/login-history${buildQS({
          page: params.page,
          page_size: params.page_size,
          start: params.start,
          end: params.end,
        })}`,
      ),
    placeholderData: (prev) => prev,
  });
}
