export type SourceType = 'ldap' | 'csv' | 'coremail' | 'neteml';

export type SyncMode = 'full' | 'incremental';

export type SyncStatus = 'unsynced' | 'running' | 'success' | 'partial' | 'failed' | 'canceled';

export type ContactTag = 'none' | 'executive' | 'key_position';

export type ContactStatus = 'active' | 'stale';

export type SyncType = 'manual' | 'auto';

export interface ContactSource {
  id: number;
  tenant_id?: number;
  name: string;
  source_type: SourceType;
  priority: number;
  auto_sync_enabled: boolean;
  cron_expr?: string;
  sync_mode: SyncMode;
  conflict_policy?: string;
  sync_status: SyncStatus;
  last_sync_time?: string;
  last_error?: string;
  created_at?: string;
  updated_at: string;
  secret_present: boolean;
  config?: Record<string, unknown>;
  [key: string]: unknown;
}

export interface ContactSourcePayload {
  name: string;
  source_type: SourceType;
  config: Record<string, unknown>;
  priority?: number;
  auto_sync_enabled?: boolean;
  cron_expr?: string;
  sync_mode?: SyncMode;
  conflict_policy?: string;
  test_token: string;
  updated_at?: string;
}

export interface Contact {
  id: number;
  source_id?: number;
  source_name?: string;
  email: string;
  display_name: string;
  department_path: string;
  job_title: string;
  external_uid?: string;
  tag: ContactTag;
  tag_label?: string;
  status: ContactStatus;
  status_label?: string;
  created_at?: string;
  updated_at?: string;
  [key: string]: unknown;
}

export interface ContactSyncLog {
  id: number;
  tenant_id?: number;
  source_id?: number;
  source_name?: string;
  sync_type: SyncType;
  sync_mode: SyncMode;
  status: SyncStatus | string;
  cancel_requested?: boolean;
  added_count: number;
  updated_count: number;
  deleted_count: number;
  failed_count: number;
  total_count: number;
  processed_count: number;
  duration_ms?: number;
  params_snapshot?: string;
  started_at: string;
  finished_at?: string;
  [key: string]: unknown;
}

export interface ContactSyncFailure {
  id: number;
  sync_log_id?: number;
  row_no?: number;
  external_uid?: string;
  email?: string;
  reason: string;
  created_at?: string;
}

export interface ContactSyncLogDetail extends ContactSyncLog {
  failures: {
    items: ContactSyncFailure[];
    total: number;
    page: number;
    page_size: number;
  };
}

export interface ContactSyncStatus {
  sync_log_id: number;
  source_id: number;
  sync_type: SyncType;
  sync_mode: SyncMode;
  status: SyncStatus | string;
  processed_count: number;
  total_count: number;
  added_count: number;
  updated_count: number;
  deleted_count: number;
  failed_count: number;
  duration_ms?: number;
  started_at: string;
  finished_at?: string;
  cancel_requested: boolean;
}

export interface ContactSourceImpact {
  contact_count: number;
  affected_profiles: string[];
}

export interface ContactTestResult {
  ok: boolean;
  info?: string | Record<string, unknown>;
  test_token?: string;
}

export interface ContactCSVUploadResult {
  upload_token: string;
  user_file_ref?: string;
  dept_file_ref?: string;
  headers: string[];
  dept_headers?: string[];
}

export interface ContactCSVPreviewResult {
  headers: string[];
  rows: Record<string, unknown>[];
  test_token: string;
  valid: boolean;
}

export interface ContactSyncTriggerResult {
  sync_log_id: number;
}

export interface BulkContactPayload {
  action: 'tag' | 'untag';
  tag?: 'executive' | 'key_position'; // required when action === 'tag'
  ids: number[];
}

export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page?: number;
  page_size?: number;
}

export interface ContactListParams {
  source_id?: number;
  dept?: string;
  keyword?: string;
  job_title?: string;
  tag?: ContactTag | '';
  page?: number;
  page_size?: number;
}

export interface ContactSourceListParams {
  search?: string;
  // GT-12038 filter drawer. Empty string / undefined = no constraint.
  source_type?: SourceType | '';
  sync_status?: SyncStatus | '';
  // Tri-state: undefined = no constraint, true/false = filter on that value.
  auto_sync?: boolean;
  page?: number;
  page_size?: number;
}

export interface ContactSyncLogListParams {
  source_id?: number;
  status?: string;
  sync_type?: string;
  start_time?: string;
  end_time?: string;
  page?: number;
  page_size?: number;
}

