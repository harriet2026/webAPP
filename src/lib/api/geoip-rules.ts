import { apiRequest, type ApiRequestFn } from './client';
import type { GeoIpRule, GeoIpRuleListResponse } from '@/types/overseas-mail';

export async function listGeoIpRules(
  params: { page?: number; page_size?: number; search?: string },
  requestFn: ApiRequestFn = apiRequest,
) {
  const qs = new URLSearchParams();
  if (params.page) qs.set('page', String(params.page));
  if (params.page_size) qs.set('page_size', String(params.page_size));
  if (params.search) qs.set('search', params.search);
  return requestFn<GeoIpRuleListResponse>(`/geoip-rules?${qs}`);
}

export async function createGeoIpRule(
  body: { ip_range: string; region_code: string; region_name: string },
  requestFn: ApiRequestFn = apiRequest,
) {
  return requestFn<GeoIpRule>('/geoip-rules', { method: 'POST', body });
}

export async function updateGeoIpRule(
  id: number,
  body: { ip_range: string; region_code: string; region_name: string },
  requestFn: ApiRequestFn = apiRequest,
) {
  return requestFn<GeoIpRule>(`/geoip-rules/${id}`, { method: 'PUT', body });
}

export async function deleteGeoIpRule(id: number, requestFn: ApiRequestFn = apiRequest) {
  return requestFn<void>(`/geoip-rules/${id}`, { method: 'DELETE' });
}

// ---------------------------------------------------------------------------
// GT-12114 Q-03/Q-07：国家字典与导出
// ---------------------------------------------------------------------------

export interface GeoCountry {
  code: string;
  name_zh: string;
  name_en: string;
}

/** 常用国家/地区（无搜索词时的默认列表，产品决策"默认展示 20 个高频国家"）。 */
export const COMMON_GEO_COUNTRY_CODES = [
  'CN', 'US', 'HK', 'MO', 'TW', 'SG', 'JP', 'KR', 'AU', 'GB',
  'DE', 'FR', 'RU', 'CA', 'IN', 'TH', 'VN', 'MY', 'ID', 'BR',
] as const;

/** 全量字典由后端下发（避免前端硬编码，产品决策 Q-03）。 */
export async function listGeoCountries(requestFn: ApiRequestFn = apiRequest) {
  return requestFn<{ items: GeoCountry[] }>('/geoip/countries');
}

/** 无搜索词 → 常用 20 国（按 COMMON 顺序）；有搜索词 → 全量按代码/中英文名过滤。 */
export function filterGeoCountries(all: GeoCountry[], search: string): GeoCountry[] {
  const q = search.trim().toLowerCase();
  if (!q) {
    const byCode = new Map(all.map((c) => [c.code, c]));
    return COMMON_GEO_COUNTRY_CODES.map((code) => byCode.get(code)).filter(
      (c): c is GeoCountry => Boolean(c),
    );
  }
  return all.filter(
    (c) =>
      c.code.toLowerCase().includes(q) ||
      c.name_zh.toLowerCase().includes(q) ||
      c.name_en.toLowerCase().includes(q),
  );
}

/** 展示名：中文界面用 name_zh，其余 locale 用 name_en。 */
export function geoCountryDisplayName(country: GeoCountry, locale: string): string {
  return locale === 'zh' ? country.name_zh : country.name_en;
}

/** GT-12114 Q-07：导出（JSON/CSV）。返回 Blob，由调用方触发浏览器下载。 */
export async function exportGeoIpRules(format: 'json' | 'csv', requestFn: ApiRequestFn = apiRequest) {
  return requestFn<Blob>(`/geoip-rules/export?format=${format}`, { responseType: 'blob' });
}
