import { apiRequest, type ApiRequestFn, API_BASE } from './client';
import type {
  EmailLog,
  EmailLogListResponse,
  EmailLogSearchParams,
  MailLogEventsResponse,
} from '@/types/log';

export async function getEmailLogs(params: EmailLogSearchParams, requestFn: ApiRequestFn = apiRequest): Promise<EmailLogListResponse> {
  const query = new URLSearchParams();
  // 所有 EmailLogSearchParams 字段（含 similar=matched，见相似检测"查看观察日志"入口）
  // 都透传进查询串——这里不需要按字段名单独枚举。
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') {
      query.set(key, String(value));
    }
  });
  return requestFn<EmailLogListResponse>(`/mail-logs?${query}`);
}

export async function getEmailLog(id: number, requestFn: ApiRequestFn = apiRequest): Promise<EmailLog> {
  return requestFn<EmailLog>(`/mail-logs/${id}`);
}

export async function getEmailLogEvents(id: number, requestFn: ApiRequestFn = apiRequest): Promise<MailLogEventsResponse> {
  return requestFn<MailLogEventsResponse>(`/mail-logs/${id}/events?page=1&page_size=100`);
}

export interface SSEEvent {
  event: string;
  data: string;
}

export function getTenantHeader(): Record<string, string> {
  if (typeof window === 'undefined') return {};
  const userStr = localStorage.getItem('osgateway_user');
  if (!userStr) return {};
  try {
    const user = JSON.parse(userStr);
    if (user?.role === 'tenant_admin' && user?.tenant_id != null) {
      return { 'X-Tenant-ID': String(user.tenant_id) };
    }
    const storedTenant = localStorage.getItem('osgateway_selected_tenant');
    if (storedTenant) {
      return { 'X-Tenant-ID': storedTenant };
    }
  } catch {}
  return {};
}

export async function* fetchSSE(url: string, signal?: AbortSignal): AsyncGenerator<SSEEvent> {
  const headers: Record<string, string> = {
    ...getTenantHeader(),
  };

  const response = await fetch(url, {
    credentials: 'include',
    headers,
    signal,
  });

  if (!response.ok) {
    if (response.status === 401) {
      throw new Error('Unauthorized');
    }
    let code = 'internal_error';
    let message = 'Request failed';
    try {
      const body = await response.json();
      message = body?.error?.message || body?.error || message;
      code = body?.error?.code || code;
    } catch {}
    yield { event: 'error', data: JSON.stringify({ code, message }) };
    return;
  }

  const reader = response.body?.getReader();
  if (!reader) return;

  const decoder = new TextDecoder();
  let buffer = '';

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      const parts = buffer.split('\n\n');
      buffer = parts.pop() || '';

      for (const part of parts) {
        if (!part.trim()) continue;
        let event = 'message';
        let data = '';
        for (const line of part.split('\n')) {
          if (line.startsWith('event: ')) {
            event = line.slice(7).trim();
          } else if (line.startsWith('data: ')) {
            data = line.slice(6);
          }
        }
        if (data) {
          yield { event, data };
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
}

export function buildAIInterpretURL(id: number, locale: string, showThinking?: boolean): string {
  const params = new URLSearchParams({ locale });
  if (showThinking) params.set('show_thinking', 'true');
  return `${API_BASE}/mail-logs/${id}/ai-interpret?${params}`;
}

export async function exportEmailLogs(
  params: EmailLogSearchParams,
  headers: Record<string, string> = {},
): Promise<Blob> {
  const query = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') {
      query.set(key, String(value));
    }
  });

  // GT-11771 P2: apiRequest cannot be reused here because it parses the
  // response as JSON; CSV export needs response.blob(). Use raw fetch with
  // the same API_BASE fallback and forward the caller-provided headers
  // (X-Tenant-ID from useApiRequest scope), otherwise a system_admin with
  // a selected tenant would export every tenant's logs.
  const base = process.env.NEXT_PUBLIC_API_URL || '/api/v1';
  const response = await fetch(
    `${base}/mail-logs/export?${query}`,
    {
      credentials: 'include',
      headers,
    }
  );

  if (!response.ok) throw new Error('Export failed');
  return response.blob();
}
