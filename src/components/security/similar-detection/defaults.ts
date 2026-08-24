import type {
  SimilarDetectionConfig,
  SimilarDetectionDirection,
  SimilarDetectionDirectionConfig,
} from './types';

export const DIRECTIONS: SimilarDetectionDirection[] = ['receive', 'send', 'internal'];

export const WINDOW_MIN = 1;
export const WINDOW_MAX = 1440;
export const SIMILARITY_MIN = 50;
export const SIMILARITY_MAX = 100;
export const SIMILARITY_STEP = 5;
export const SIMILARITY_DEFAULT = 80;
export const MIN_COUNT_MIN = 1;
export const MIN_COUNT_MAX = 9999;

// demo 运行态默认值，逐字段等于 internal/models/similar_detection.go
// DefaultSimilarDetectionConfig（2026-07-17 实测，见该文件注释）。
export function defaultConfig(): SimilarDetectionConfig {
  const aggregate: SimilarDetectionDirectionConfig = {
    observe_mode: false,
    window_minutes: 30,
    similarity_pct: 80,
    min_count: 10,
    action: 'quarantine',
  };
  return {
    mode: 'separate',
    enabled_directions: ['receive', 'send', 'internal'],
    aggregate,
    similar_email: {
      receive: { observe_mode: true, window_minutes: 30, similarity_pct: 80, min_count: 10, action: 'quarantine' },
      send: { observe_mode: false, window_minutes: 30, similarity_pct: 80, min_count: 10, action: 'quarantine' },
      internal: {
        observe_mode: false,
        window_minutes: 30,
        similarity_pct: 80,
        min_count: 10,
        action: 'accept',
        tag_subject_enabled: true,
        tag_subject_position: 'prefix',
        tag_subject_content: '[相似邮件]',
      },
    },
    same_subject: {
      receive: { observe_mode: true, window_minutes: 60, similarity_pct: 90, min_count: 50, action: 'quarantine' },
      send: { observe_mode: true, window_minutes: 60, similarity_pct: 90, min_count: 50, action: 'audit' },
      internal: { observe_mode: false, window_minutes: 60, similarity_pct: 90, min_count: 50, action: 'quarantine' },
    },
    subject_normalization: {
      ignore_case: true,
      ignore_re_prefix: true,
      ignore_numbers: false,
      similar_subject: true,
    },
    version: 0,
  };
}
