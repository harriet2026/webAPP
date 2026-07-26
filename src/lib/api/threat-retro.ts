import { apiRequest, type ApiRequestFn, API_BASE } from './client';
import type {
  RunListFilters,
  RunListResponse,
  ThreatRetroRunDetail,
  ThreatRetroStats,
  ThreatRetroStrategy,
  ThreatRetroAgentState,
  ThreatRetroModelInfo,
  AffectedRecipient,
  ThreatRetroBulkResult,
  ThreatRetroNotificationPreview,
} from '@/types/threat-retro';

const BASE = '/threat-retro-agent';

export async function getRuns(
  filters: RunListFilters,
  requestFn: ApiRequestFn = apiRequest,
): Promise<RunListResponse> {
  const q = new URLSearchParams();
  const setScalar = (k: string, v: unknown) => {
    if (v !== undefined && v !== null && v !== '') q.set(k, String(v));
  };
  setScalar('page', filters.page);
  setScalar('page_size', filters.page_size);
  setScalar('keyword', filters.keyword);
  setScalar('start', filters.start);
  setScalar('end', filters.end);
	setScalar('time_preset', filters.time_preset);
  setScalar('leak_disposition', filters.leak_disposition);
  setScalar('time_basis', filters.time_basis);
  setScalar('recall_outcome', filters.recall_outcome);
  const appendMulti = (k: string, vs?: unknown[]) => {
    if (Array.isArray(vs))
      vs.forEach((v) => {
        if (v !== undefined && v !== null && v !== '') q.append(k, String(v));
      });
  };
  // Backend reads `task_status` (parseRunFilters in threat_retro_runs.go).
  appendMulti('task_status', filters.status);
  appendMulti('recall_status', filters.recall_status);
  appendMulti('risk_level', filters.risk_level);
  return requestFn<RunListResponse>(`${BASE}/runs?${q.toString()}`);
}

export async function getRunDetail(
  runId: string,
  requestFn: ApiRequestFn = apiRequest,
): Promise<ThreatRetroRunDetail> {
  return requestFn<ThreatRetroRunDetail>(`${BASE}/runs/${encodeURIComponent(runId)}`);
}

export async function getThreatRetroStats(
  params: { start?: string; end?: string } = {},
  requestFn: ApiRequestFn = apiRequest,
): Promise<ThreatRetroStats> {
  const q = new URLSearchParams();
  if (params.start) q.set('start', params.start);
  if (params.end) q.set('end', params.end);
  return requestFn<ThreatRetroStats>(`${BASE}/stats?${q.toString()}`);
}

export async function startScan(
  body: { strategy_id: number; window_start: string; window_end: string; test?: boolean },
  requestFn: ApiRequestFn = apiRequest,
): Promise<{ run_id: string }> {
  return requestFn<{ run_id: string }>(`${BASE}/scan`, { method: 'POST', body });
}

export async function recallLeakMails(
  runId: string,
  body: { mail_log_ids: number[] },
  requestFn: ApiRequestFn = apiRequest,
): Promise<{ created: number }> {
  return requestFn<{ created: number }>(`${BASE}/runs/${encodeURIComponent(runId)}/recall`, {
    method: 'POST',
    body,
  });
}

export async function markFalsePositive(
  runId: string,
  body: { mail_log_id: number; reason: string; add_whitelist?: boolean },
  requestFn: ApiRequestFn = apiRequest,
): Promise<{ status: string }> {
  return requestFn<{ status: string }>(`${BASE}/runs/${encodeURIComponent(runId)}/false-positive`, {
    method: 'POST',
    body,
  });
}

export async function cancelRun(
  runId: string,
  requestFn: ApiRequestFn = apiRequest,
): Promise<{ cancelled: number }> {
  return requestFn<{ cancelled: number }>(`${BASE}/runs/${encodeURIComponent(runId)}/cancel`, {
    method: 'POST',
  });
}

export async function bulkCancelRuns(ids: string[], requestFn: ApiRequestFn = apiRequest): Promise<ThreatRetroBulkResult> {
  return requestFn<ThreatRetroBulkResult>(`${BASE}/runs/bulk`, { method: 'POST', body: { action: 'cancel', ids } });
}

export async function exportRuns(ids: string[], requestFn: ApiRequestFn = apiRequest): Promise<Blob> {
  return requestFn<Blob>(`${BASE}/runs/export`, {
    method: 'POST',
    body: { run_ids: ids },
    responseType: 'blob',
  });
}

export async function previewThreatRetroNotification(
  kind: 'immediate' | 'digest',
  requestFn: ApiRequestFn = apiRequest,
): Promise<ThreatRetroNotificationPreview> {
  return requestFn<ThreatRetroNotificationPreview>(`${BASE}/notification-preview`, { method: 'POST', body: { kind } });
}

export async function getRecipients(
  mailLogId: number,
  requestFn: ApiRequestFn = apiRequest,
): Promise<{ recipients: AffectedRecipient[] }> {
  return requestFn<{ recipients: AffectedRecipient[] }>(`${BASE}/mail/${mailLogId}/recipients`);
}

export async function getRunAffectedRecipients(
	runId: string,
	requestFn: ApiRequestFn = apiRequest,
): Promise<{ recipients: AffectedRecipient[] }> {
	const detail = await getRunDetail(runId, requestFn);
	const perMail = await Promise.all(
		detail.leak_mails
			.filter((leak) => leak.disposition !== 'false_positive')
			.map(async (leak) => {
				const released = new Set((leak.released_recipients ?? []).map((address) => address.toLowerCase()));
				if (released.size === 0) return [];
				const result = await getRecipients(leak.mail_log_id, requestFn);
				return result.recipients.filter((recipient) => released.has(recipient.address.toLowerCase()));
			}),
	);
	const byAddress = new Map<string, AffectedRecipient>();
	perMail.flat().forEach((recipient) => {
		const key = recipient.address.toLowerCase();
		const existing = byAddress.get(key);
		if (!existing || existing.is_read == null) byAddress.set(key, recipient);
	});
	return { recipients: Array.from(byAddress.values()) };
}

export function emlUrl(mailLogId: number): string {
  return `${API_BASE}${BASE}/mail/${mailLogId}/eml`;
}

// The backend stores strategy config inside a Rule.metadata JSON string.
// These helpers normalise the mismatch so callers work with ThreatRetroStrategy.

type RuleRow = { id?: number; name: string; metadata?: string | Record<string, unknown> };

function ruleToStrategy(row: RuleRow): ThreatRetroStrategy {
  const meta: Record<string, unknown> =
    typeof row.metadata === 'string'
      ? (JSON.parse(row.metadata) as Record<string, unknown>)
      : (row.metadata ?? {});
  // Provide defaults for fields that old DB rows may not have stored in metadata.
  // Cast through unknown because meta (Record<string,unknown>) carries mode/etc at runtime.
  return {
    feature: 'threat_retro_strategy' as const,
    mode: 'deep' as const,
    status: 'disabled' as const,
    color_dot: '#1677FF',
    schedule: { run_times: [] as string[], weekdays: [] as number[], month_days: [] as number[] },
    lookback_window_minutes: 60,
    realtime: { listen_sources: [] as string[], confidence_threshold: 80, cooldown_minutes: 30, fixed_lookback_minutes: 1440 },
    resource_limits: { max_tool_calls: 20, max_url_fetches: 10 },
    disposition: {
      decision_mode: 'conservative' as const,
      auto_confidence_threshold: 90,
      decision_timeout_hours: 24,
      recall_actions: ['soft_delete'] as ['soft_delete'],
      unread_policy: 'recall' as const,
      read_policy: 'notify' as const,
      circuit_breaker_threshold: 100,
      max_recall_per_run: 500,
    },
    exclusions: { exclude_rcpt_sys_tags: [] as string[], exclude_email_list: [] as string[] },
    notify: {
      enabled: false,
      recipients: [] as string[],
      high: { enabled: true },
      medium: { enabled: true, min_confidence: 80 },
      low: { enabled: true, digest_time: '20:00' },
    },
    ...meta,
    id: row.id,
    name: row.name,
  } as unknown as ThreatRetroStrategy;
}

function strategyToRequest(s: ThreatRetroStrategy): { name: string; metadata: Record<string, unknown> } {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { id, name, stats, next_run, realtime, ...meta } = s;
  return { name, metadata: meta as Record<string, unknown> };
}

export async function listStrategies(
  requestFn: ApiRequestFn = apiRequest,
): Promise<ThreatRetroStrategy[]> {
  const resp = await requestFn<{ items: RuleRow[] }>(`${BASE}/strategies`);
  return (resp.items ?? []).map(ruleToStrategy);
}
export async function createStrategy(
  body: ThreatRetroStrategy,
  requestFn: ApiRequestFn = apiRequest,
): Promise<ThreatRetroStrategy> {
  const row = await requestFn<RuleRow>(`${BASE}/strategies`, {
    method: 'POST',
    body: strategyToRequest(body),
  });
  return ruleToStrategy(row);
}
export async function updateStrategy(
  id: number,
  body: ThreatRetroStrategy,
  requestFn: ApiRequestFn = apiRequest,
): Promise<void> {
  await requestFn<void>(`${BASE}/strategies/${id}`, { method: 'PUT', body: strategyToRequest(body) });
}
export async function deleteStrategy(
  id: number,
  requestFn: ApiRequestFn = apiRequest,
): Promise<void> {
  await requestFn<void>(`${BASE}/strategies/${id}`, { method: 'DELETE' });
}
export async function cloneStrategy(
  id: number,
  requestFn: ApiRequestFn = apiRequest,
): Promise<ThreatRetroStrategy> {
  const row = await requestFn<RuleRow>(`${BASE}/strategies/${id}/clone`, { method: 'POST' });
  return ruleToStrategy(row);
}

export async function getAgentState(
  requestFn: ApiRequestFn = apiRequest,
): Promise<ThreatRetroAgentState> {
  return requestFn<ThreatRetroAgentState>(`${BASE}/agent-state`);
}
export async function putAgentState(
  body: ThreatRetroAgentState,
  requestFn: ApiRequestFn = apiRequest,
): Promise<void> {
  await requestFn<void>(`${BASE}/agent-state`, { method: 'PUT', body });
}
export async function getModelInfo(
  requestFn: ApiRequestFn = apiRequest,
): Promise<ThreatRetroModelInfo> {
  return requestFn<ThreatRetroModelInfo>(`${BASE}/model-info`);
}
