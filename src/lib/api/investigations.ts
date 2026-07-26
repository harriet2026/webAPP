import { apiRequest, type ApiRequestFn } from './client';
import type {
  CreateInvestigationRequest,
  CreateInvestigationResponse,
  InvestigationDetailResponse,
  InvestigationListParams,
  InvestigationListResponse,
} from '@/types/investigation';

function buildQuery(params: Record<string, unknown>): string {
  const query = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') {
      query.set(key, String(value));
    }
  });
  return query.toString();
}

export async function getInvestigations(
  params: InvestigationListParams,
  requestFn: ApiRequestFn = apiRequest,
): Promise<InvestigationListResponse> {
  const query = buildQuery(params as Record<string, unknown>);
  return requestFn<InvestigationListResponse>(`/investigations?${query}`);
}

export async function getInvestigation(
  id: string,
  requestFn: ApiRequestFn = apiRequest,
): Promise<InvestigationDetailResponse> {
  return requestFn<InvestigationDetailResponse>(`/investigations/${id}`);
}

export async function createInvestigation(
  body: CreateInvestigationRequest,
  requestFn: ApiRequestFn = apiRequest,
): Promise<CreateInvestigationResponse> {
  return requestFn<CreateInvestigationResponse>('/investigations', {
    method: 'POST',
    body,
  });
}

export async function cancelInvestigation(
  id: string,
  requestFn: ApiRequestFn = apiRequest,
): Promise<{ status: string }> {
  // Backend returns {"status": "<state>"} (e.g. "cancelled"), not {cancelled}.
  return requestFn<{ status: string }>(`/investigations/${encodeURIComponent(id)}/cancel`, {
    method: 'POST',
  });
}
