export type InvestigationType =
  | 'phish_analysis'
  | 'similarity_search'
  | 'account_anomaly_analysis'
  | 'threat_traceback'
  | 'rule_analysis';

export type InvestigationStatus =
  | 'pending'
  | 'running'
  | 'completed'
  | 'failed'
  | 'needs_approval'
  | 'cancelled';

export type InvestigationRiskLevel = 'low' | 'medium' | 'high' | 'critical' | '';

export type InvestigationTargetType = 'mail' | 'mail_batch' | 'account' | 'cluster';

export interface InvestigationStep {
  name: string;
  status: string;
  message?: string;
  data?: Record<string, unknown>;
  started_at?: string;
  finished_at?: string;
}

export interface InvestigationEvidence {
  type: string;
  severity: string;
  title: string;
  detail: string;
  data?: Record<string, unknown>;
}

export interface InvestigationRelatedObjects {
  mail_log_ids?: number[];
  domains?: string[];
  urls?: string[];
  attachments?: string[];
  accounts?: string[];
}

export interface InvestigationRecommendedAction {
  type: string;
  scope?: string;
  target_count?: number;
  reason?: string;
  data?: Record<string, unknown>;
}

export interface InvestigationResult {
  verdict?: string;
  summary?: string;
  evidence?: InvestigationEvidence[];
  related_objects?: InvestigationRelatedObjects;
  recommended_actions?: InvestigationRecommendedAction[];
  details?: Record<string, unknown>;
}

export interface InvestigationTask {
  id: string;
  type: InvestigationType;
  status: InvestigationStatus;
  trigger_type: string;
  source_type?: string;
  source_id?: string;
  target_type: InvestigationTargetType;
  target_ids: string[];
  prompt?: string;
  summary: string;
  risk_level: InvestigationRiskLevel;
  confidence?: number | null;
  result: InvestigationResult;
  steps: InvestigationStep[];
  recommended_actions: InvestigationRecommendedAction[];
  error_message?: string;
  created_by: string;
  approved_by?: string;
  created_at: string;
  updated_at: string;
}

export interface InvestigationAction {
  id: string;
  task_id: string;
  action_type: string;
  status: string;
  request: Record<string, unknown>;
  result: Record<string, unknown>;
  error_message?: string;
  created_by: string;
  approved_by?: string;
  created_at: string;
  updated_at: string;
}

export interface InvestigationListResponse {
  total: number;
  page: number;
  limit: number;
  items: InvestigationTask[];
}

export interface InvestigationDetailResponse {
  task: InvestigationTask;
  actions: InvestigationAction[];
}

export interface CreateInvestigationRequest {
  type: InvestigationType;
  target_type: InvestigationTargetType;
  target_ids: string[];
  source_type?: string;
  source_id?: string;
  prompt?: string;
}

export interface CreateInvestigationResponse {
  id: string;
  status: InvestigationStatus;
}

export interface InvestigationListParams {
  page?: number;
  limit?: number;
  type?: InvestigationType | '';
  status?: InvestigationStatus | '';
  risk_level?: InvestigationRiskLevel;
  created_by?: string;
  target_id?: string;
}
