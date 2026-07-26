export const LINK_TYPE_COLORS: Record<string, string> = {
  phishing: '#F5222D',
  malware_download: '#722ED1',
  spam: '#FAAD14',
  c2: '#CF1322',
  qr_phishing: '#EB2F96',
};

export const ATTACHMENT_TYPE_COLORS: Record<string, string> = {
  virus: '#F5222D',
  macro: '#FA8C16',
  zip_bomb: '#FADB14',
  exploit: '#722ED1',
  other: '#EB2F96',
};

export const REPUTATION_COLORS: Record<string, string> = {
  high_risk: '#F5222D',
  medium_risk: '#FA8C16',
  low_risk: '#FADB14',
  normal: '#52C41A',
  unknown: '#8C8C8C',
};

export const SANDBOX_RESULT_COLORS: Record<string, string> = {
  malicious: '#F5222D',
  suspicious: '#FA8C16',
  clean: '#52C41A',
  not_detected: '#8C8C8C',
  detecting: '#1890FF',
};

export const FILE_TYPE_COLORS: Record<string, string> = {
  exe: '#F5222D',
  doc: '#722ED1',
  pdf: '#1890FF',
  zip: '#FA8C16',
  xls: '#52C41A',
  other: '#8C8C8C',
};

// severityLevel classifies a value into a 3-band threat level ('high' | 'mid' |
// 'low') using inclusive lower bounds [high, mid]: v >= high → 'high',
// v >= mid → 'mid', else 'low'. Pure + exported so the threshold rules
// (spec §4.8) are unit-testable without rendering a component.
export type SeverityLevel = 'high' | 'mid' | 'low';

export function severityLevel(value: number, highAt: number, midAt: number): SeverityLevel {
  if (value >= highAt) return 'high';
  if (value >= midAt) return 'mid';
  return 'low';
}

// linkDetectionRateLevel: ≥15% high / 5–15% mid / <5% low (spec §4.8).
export const linkDetectionRateLevel = (v: number): SeverityLevel => severityLevel(v, 15, 5);
// attachmentDetectionRateLevel: ≥5% high / 1–5% mid / <1% low (spec §4.8).
export const attachmentDetectionRateLevel = (v: number): SeverityLevel => severityLevel(v, 5, 1);

// SEVERITY_TEXT_CLASS maps a severity level to the KPI value text color (rose /
// amber / emerald), matching the demo palette.
export const SEVERITY_TEXT_CLASS: Record<SeverityLevel, string> = {
  high: 'text-rose-600 dark:text-rose-400',
  mid: 'text-amber-600 dark:text-amber-400',
  low: 'text-emerald-600 dark:text-emerald-400',
};

// blockRateLevel: the detail-table 拦截率 band — ≥97% high(good) / 95–97% mid /
// <95% low (spec §4.8). Note the semantics are inverted vs detection rate
// (higher block rate is better), so callers pick the color mapping.
export const blockRateLevel = (v: number): SeverityLevel => severityLevel(v, 97, 95);

export const LINK_TYPE_KEYS = ['phishing', 'malware_download', 'spam', 'c2', 'qr_phishing'] as const;
export const ATTACHMENT_TYPE_KEYS = ['virus', 'macro', 'zip_bomb', 'exploit', 'other'] as const;

// demo 明细表只展示四个主链接类别；二维码钓鱼保留在趋势/分布图中。
export const LINK_DETAIL_KEYS = ['phishing', 'malware_download', 'c2', 'spam'] as const;
// GT-12461: the attachment detail contract is ten business columns. `other`
// remains available to the trend/distribution and expanded-row donut, but is
// intentionally not rendered as an eleventh detail column.
export const ATTACHMENT_DETAIL_KEYS = ['virus', 'macro', 'zip_bomb', 'exploit'] as const;
