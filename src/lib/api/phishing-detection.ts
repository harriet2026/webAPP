import { apiRequest, type ApiRequestFn, API_BASE } from './client';
import type {
  PhishingStats,
  DetectionLogFilters,
  DetectionLogListResponse,
  DetectionLogDetail,
  BlockResponse,
  ExemptResponse,
} from '@/types/phishing-detection';

export async function getDetectionStats(
  params: { start?: string; end?: string } = {},
  requestFn: ApiRequestFn = apiRequest,
): Promise<PhishingStats> {
  const query = new URLSearchParams();
  if (params.start) query.set('start', params.start);
  if (params.end) query.set('end', params.end);
  return requestFn<PhishingStats>(`/phishing-agent/stats?${query.toString()}`);
}

export async function getDetectionLogs(
  filters: DetectionLogFilters,
  requestFn: ApiRequestFn = apiRequest,
): Promise<DetectionLogListResponse> {
  const query = new URLSearchParams();
  const setScalar = (key: string, value: unknown) => {
    if (value !== undefined && value !== null && value !== '') {
      query.set(key, String(value));
    }
  };
  setScalar('page', filters.page);
  setScalar('page_size', filters.page_size);
  setScalar('keyword', filters.keyword);
  setScalar('start', filters.start);
  setScalar('end', filters.end);
  setScalar('status', filters.status);
  const appendMulti = (key: string, values: unknown[] | undefined) => {
    if (Array.isArray(values)) {
      values.forEach((value) => {
        if (value !== undefined && value !== null && value !== '') {
          query.append(key, String(value));
        }
      });
    }
  };
  appendMulti('disposition', filters.disposition);
  appendMulti('detection_mode', filters.detection_mode);
  appendMulti('recall_status', filters.recall_status);
  appendMulti('risk_level', filters.risk_level);
  return requestFn<DetectionLogListResponse>(`/phishing-agent/detection-logs?${query.toString()}`);
}

export async function getDetectionLogDetail(
  id: string,
  requestFn: ApiRequestFn = apiRequest,
): Promise<DetectionLogDetail> {
  return requestFn<DetectionLogDetail>(`/phishing-agent/detection-logs/${id}`);
}

export async function blockDetection(
  id: string,
  requestFn: ApiRequestFn = apiRequest,
): Promise<BlockResponse> {
  return requestFn<BlockResponse>(`/phishing-agent/detection-logs/${id}/block`, {
    method: 'POST',
  });
}

export async function exemptDetection(
  id: string,
  reason: string,
  requestFn: ApiRequestFn = apiRequest,
): Promise<ExemptResponse> {
  return requestFn<ExemptResponse>(`/phishing-agent/detection-logs/${id}/exempt`, {
    method: 'POST',
    body: { reason },
  });
}

export function screenshotUrl(storageNode: string, key: string): string {
  const params = new URLSearchParams();
  params.set('storage_node', storageNode);
  params.set('key', key);
  return `${API_BASE}/phishing-agent/screenshot?${params.toString()}`;
}
