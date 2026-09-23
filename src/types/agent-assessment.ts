// The detail API uses Go encoding/json for assessment.proto: snake_case,
// string domain values, numeric byte counts, and omitted zero/empty fields.
export interface AssessmentOrigin {
  kind?: string;
  task_id?: string;
  task_attempt_id?: string;
  local_run_id?: string;
  analysis_run_id?: string;
  invocation_id?: string;
  plan_revision?: string;
}

export interface AssessmentLimits {
  max_subjects?: number;
  max_sources?: number;
  max_factors?: number;
  max_gaps?: number;
  max_references_per_factor?: number;
  max_text_bytes?: number;
  max_source_bytes?: number;
  max_retained_bytes?: number;
  max_report_bytes?: number;
  max_result_bytes?: number;
}

export interface AssessmentSubject {
  id: string;
  key?: string;
  kind?: string;
  label?: string;
}

export interface AssessmentExtraction {
  parent_key?: string;
  parent_sha256?: string;
  parent_bytes?: number;
  parent_outcome?: string;
  parent_truncated?: boolean;
  start_byte?: number;
  end_byte?: number;
}

export interface AssessmentSource {
  id: string;
  key?: string;
  kind?: string;
  target?: string;
  outcome?: string;
  content?: string;
  original_sha256?: string;
  original_bytes?: number;
  retained_sha256?: string;
  retained_bytes?: number;
  truncated?: boolean;
  extraction?: AssessmentExtraction;
  captured_truncated?: boolean;
}

export interface AssessmentFactor {
  id: string;
  subject_ref: string;
  observation: string;
  relevance: string;
  direction: string;
  strength: string;
  source_refs: string[];
  limitation?: string;
}

export interface AssessmentGap {
  subject_ref?: string;
  code?: string;
  detail?: string;
}

// Unsupported versions arrive only as schema_version markers. Consumers must
// branch on the read status/version before interpreting any nested fields.
export interface AssessmentReport {
  schema_version: number;
  snapshot_sha256?: string;
  origin?: AssessmentOrigin;
  limits?: AssessmentLimits;
  subjects?: AssessmentSubject[];
  sources?: AssessmentSource[];
  factors?: AssessmentFactor[];
  gaps?: AssessmentGap[];
  omitted_subjects?: number;
  omitted_sources?: number;
  omitted_gaps?: number;
}

export interface AssessmentFailure {
  schema_version: number;
  origin?: AssessmentOrigin;
  reason?: number;
}

export interface AssessmentResultFields {
  assessment_failure?: AssessmentFailure;
  assessment_report?: AssessmentReport;
  assessment_report_status?: 'available' | 'pending' | 'not_recorded' | 'unsupported' | (string & {});
  assessment_report_reason?: string;
}
