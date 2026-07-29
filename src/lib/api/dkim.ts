import { apiRequest, type ApiRequestFn } from './client';

export type DkimAlgorithm = 'rsa-sha256' | 'ed25519-sha256';
export type DkimKeySize = 2048 | 3072 | 4096;
export type DkimDnsStatus = 'unverified' | 'verified' | 'mismatch' | 'not_found' | 'dns_error';

export interface DkimKey {
  id: number;
  tenant_id: number;
  domain: string;
  selector: string;
  algorithm: DkimAlgorithm;
  key_size?: number | null;
  public_key: string;
  dns_record_name: string;
  dns_record: string;
  dns_record_observed?: string | null;
  dns_status: DkimDnsStatus;
  dns_checked_at?: string | null;
  dns_error?: string | null;
  is_active: boolean;
  note?: string | null;
  created_at: string;
}

export interface DkimSigningDomain {
  id: number;
  tenant_id: number;
  domain: string;
}

export interface DkimKeyListResponse {
  items: DkimKey[];
  total: number;
  page: number;
  page_size: number;
}

export interface ListDkimKeysParams {
  tenant_id?: number;
  domain?: string;
  page?: number;
  page_size?: number;
}

export interface GenerateDkimKeyRequest {
  tenant_id: number;
  domain: string;
  selector: string;
  algorithm: DkimAlgorithm;
  key_size?: DkimKeySize;
  note?: string;
}

export interface ImportDkimKeyRequest {
  tenant_id: number;
  domain: string;
  selector: string;
  private_key_pem: string;
  note?: string;
}

export interface VerifyDnsResult {
  dns_status: DkimDnsStatus;
  dns_checked_at?: string | null;
  dns_record_observed?: string | null;
}

export async function listDkimSigningDomains(
  tenantId: number,
  requestFn: ApiRequestFn = apiRequest
): Promise<DkimSigningDomain[]> {
  const query = new URLSearchParams({ tenant_id: String(tenantId) });
  return requestFn<{ items: DkimSigningDomain[] }>(
    `/dkim/signing-domains?${query.toString()}`
  ).then((res) => res.items);
}

export async function listDkimKeys(
  params: ListDkimKeysParams = {},
  requestFn: ApiRequestFn = apiRequest
): Promise<DkimKeyListResponse> {
  const query = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') {
      query.set(key, String(value));
    }
  });
  const qs = query.toString();
  return requestFn<DkimKeyListResponse>(`/dkim/keys${qs ? `?${qs}` : ''}`);
}

export async function getDkimKey(id: number, requestFn: ApiRequestFn = apiRequest): Promise<DkimKey> {
  return requestFn<DkimKey>(`/dkim/keys/${id}`);
}

export async function generateDkimKey(
  data: GenerateDkimKeyRequest,
  requestFn: ApiRequestFn = apiRequest
): Promise<DkimKey> {
  return requestFn<DkimKey>('/dkim/keys/generate', {
    method: 'POST',
    body: data,
  });
}

export async function importDkimKey(
  data: ImportDkimKeyRequest,
  requestFn: ApiRequestFn = apiRequest
): Promise<DkimKey> {
  return requestFn<DkimKey>('/dkim/keys/import', {
    method: 'POST',
    body: data,
  });
}

export async function updateDkimKeyNote(
  id: number,
  note: string,
  requestFn: ApiRequestFn = apiRequest
): Promise<DkimKey> {
  return requestFn<DkimKey>(`/dkim/keys/${id}`, {
    method: 'PUT',
    body: { note },
  });
}

export async function setDkimKeyStatus(
  id: number,
  isActive: boolean,
  requestFn: ApiRequestFn = apiRequest
): Promise<void> {
  return requestFn<void>(`/dkim/keys/${id}/status`, {
    method: 'PUT',
    body: { is_active: isActive },
  });
}

export async function verifyDkimDns(
  id: number,
  requestFn: ApiRequestFn = apiRequest
): Promise<VerifyDnsResult> {
  return requestFn<VerifyDnsResult>(`/dkim/keys/${id}/verify-dns`, {
    method: 'POST',
  });
}

export async function deleteDkimKey(id: number, requestFn: ApiRequestFn = apiRequest): Promise<void> {
  return requestFn<void>(`/dkim/keys/${id}`, {
    method: 'DELETE',
  });
}
