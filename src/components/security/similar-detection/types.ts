export type SimilarDetectionDirection = 'receive' | 'send' | 'internal';
export type SimilarDetectionMode = 'aggregate' | 'separate';
export type SimilarDetectionType = 'similar_email' | 'same_subject';

export type SimilarDetectionAction =
  | 'mark-delivery'
  | 'quarantine'
  | 'review'
  | 'discard';

export interface SimilarDetectionDirectionConfig {
  observe_mode: boolean;
  window_minutes: number;
  similarity_pct: number;
  min_count: number;
  action: SimilarDetectionAction;
  tag_subject_enabled?: boolean;
  tag_subject_position?: 'prefix' | 'suffix';
  tag_subject_content?: string;
  tag_header_enabled?: boolean;
  tag_header_name?: string;
  tag_header_value?: string;
}

export interface SubjectNormalization {
  ignore_case: boolean;
  ignore_re_prefix: boolean;
  ignore_numbers: boolean;
  similar_subject: boolean;
}

export interface SimilarDetectionConfig {
  mode: SimilarDetectionMode;
  enabled_directions: SimilarDetectionDirection[];
  aggregate: SimilarDetectionDirectionConfig;
  similar_email: Record<SimilarDetectionDirection, SimilarDetectionDirectionConfig>;
  same_subject: Record<SimilarDetectionDirection, SimilarDetectionDirectionConfig>;
  subject_normalization: SubjectNormalization;
  version: number;
  updated_at?: string;
  updated_by?: string;
}

export interface SimilarDetectionPutRequest extends Omit<SimilarDetectionConfig, 'version' | 'updated_at' | 'updated_by'> {
  expected_version: number;
}
