import { apiRequest, type ApiRequestFn } from './client';

export type AuthBackend = 'local' | 'smtp_relay' | 'ldap';

export interface SMTPCredential {
  id: number;
  username: string;
  tenant_id: number;
  auth_backend: AuthBackend;
  backend_config?: string;
  is_active: boolean;
  failed_attempts: number;
  locked_until?: string;
  last_login_at?: string;
  last_login_ip?: string;
  created_at: string;
  updated_at: string;
}

export interface CreateSMTPCredentialRequest {
  username: string;
  password: string;
  tenant_id: number;
  auth_backend: AuthBackend;
  backend_config?: string;
}

export interface UpdateSMTPCredentialRequest {
  username?: string;
  auth_backend?: AuthBackend;
  backend_config?: string;
  is_active?: boolean;
}

export async function getSMTPCredentials(requestFn: ApiRequestFn = apiRequest): Promise<SMTPCredential[]> {
  const res = await requestFn<{ items: SMTPCredential[] | null }>('/smtp-credentials');
  return res.items ?? [];
}

export async function createSMTPCredential(data: CreateSMTPCredentialRequest, requestFn: ApiRequestFn = apiRequest): Promise<SMTPCredential> {
  return requestFn<SMTPCredential>('/smtp-credentials', {
    method: 'POST',
    body: data,
  });
}

export async function updateSMTPCredential(id: number, data: UpdateSMTPCredentialRequest, requestFn: ApiRequestFn = apiRequest): Promise<SMTPCredential> {
  return requestFn<SMTPCredential>(`/smtp-credentials/${id}`, {
    method: 'PUT',
    body: data,
  });
}

export async function deleteSMTPCredential(id: number, requestFn: ApiRequestFn = apiRequest): Promise<void> {
  return requestFn<void>(`/smtp-credentials/${id}`, {
    method: 'DELETE',
  });
}

export async function unlockSMTPCredential(id: number, requestFn: ApiRequestFn = apiRequest): Promise<SMTPCredential> {
  return requestFn<SMTPCredential>(`/smtp-credentials/${id}/unlock`, {
    method: 'POST',
  });
}

export async function resetSMTPCredentialPassword(id: number, newPassword: string, requestFn: ApiRequestFn = apiRequest): Promise<SMTPCredential> {
  return requestFn<SMTPCredential>(`/smtp-credentials/${id}/reset-password`, {
    method: 'POST',
    body: { new_password: newPassword },
  });
}
