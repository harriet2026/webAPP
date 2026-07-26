import { apiRequest, type ApiRequestFn } from './client';
import type {
  ProxysvrEndpoint,
  ProxysvrEndpointRequest,
  ProxysvrEndpointListResponse,
  ProxysvrGroup,
  ProxysvrGroupRequest,
  ProxysvrGroupListResponse,
} from '@/types/proxysvr';

// fetchAll fetches all pages of a paginated list endpoint (page_size=100 per request).
async function fetchAll<T>(
  path: string,
  requestFn: ApiRequestFn
): Promise<T[]> {
  const pageSize = 100;
  // GT-11771 P3: cap pagination to prevent infinite loop when concurrent
  // deletes make a page return empty items while total still exceeds the
  // accumulated count. Without this the browser hammers the endpoint
  // forever.
  const maxPages = 200;
  const items: T[] = [];
  let page = 1;
  let total = 0;
  do {
    const resp = await requestFn<{ items: T[]; total: number }>(
      `${path}?page=${page}&page_size=${pageSize}`
    );
    const pageItems = resp.items ?? [];
    if (pageItems.length === 0 && items.length < total) {
      // No progress on this page but total says there should be more —
      // concurrent deletes likely shifted the window. Stop to avoid an
      // unbounded request loop; the caller gets a partial result and can
      // re-fetch if needed.
      break;
    }
    items.push(...pageItems);
    total = resp.total ?? 0;
    page++;
  } while (items.length < total && page <= maxPages);
  return items;
}

// ---- endpoints ----

export async function listProxysvrEndpoints(
  requestFn: ApiRequestFn = apiRequest
): Promise<ProxysvrEndpoint[]> {
  return fetchAll<ProxysvrEndpoint>('/proxysvr-endpoints', requestFn);
}

export async function createProxysvrEndpoint(
  data: ProxysvrEndpointRequest,
  requestFn: ApiRequestFn = apiRequest
): Promise<ProxysvrEndpoint> {
  return requestFn<ProxysvrEndpoint>('/proxysvr-endpoints', { method: 'POST', body: data });
}

export async function updateProxysvrEndpoint(
  id: number,
  data: ProxysvrEndpointRequest,
  requestFn: ApiRequestFn = apiRequest
): Promise<ProxysvrEndpoint> {
  return requestFn<ProxysvrEndpoint>(`/proxysvr-endpoints/${id}`, { method: 'PUT', body: data });
}

export async function deleteProxysvrEndpoint(
  id: number,
  requestFn: ApiRequestFn = apiRequest
): Promise<void> {
  return requestFn<void>(`/proxysvr-endpoints/${id}`, { method: 'DELETE' });
}

// ---- groups ----

export async function listProxysvrGroups(
  requestFn: ApiRequestFn = apiRequest
): Promise<ProxysvrGroup[]> {
  return fetchAll<ProxysvrGroup>('/proxysvr-groups', requestFn);
}

/**
 * 路由规则下拉用：返回 is_active 的组。走 `/proxysvr-groups/_meta/active`
 * （任意已认证管理员可读，不限 system_admin），否则租户管理员选了 proxysvr 通道
 * 却因组 CRUD 端点 system_admin-only 而拿不到下拉。服务端已按 is_active 过滤。
 */
export async function listActiveProxysvrGroups(
  requestFn: ApiRequestFn = apiRequest
): Promise<ProxysvrGroup[]> {
  const resp = await requestFn<{ items: ProxysvrGroup[] }>('/proxysvr-groups/_meta/active');
  return resp.items ?? [];
}

export async function createProxysvrGroup(
  data: ProxysvrGroupRequest,
  requestFn: ApiRequestFn = apiRequest
): Promise<ProxysvrGroup> {
  return requestFn<ProxysvrGroup>('/proxysvr-groups', { method: 'POST', body: data });
}

export async function updateProxysvrGroup(
  id: number,
  data: ProxysvrGroupRequest,
  requestFn: ApiRequestFn = apiRequest
): Promise<ProxysvrGroup> {
  return requestFn<ProxysvrGroup>(`/proxysvr-groups/${id}`, { method: 'PUT', body: data });
}

export async function deleteProxysvrGroup(
  id: number,
  requestFn: ApiRequestFn = apiRequest
): Promise<void> {
  return requestFn<void>(`/proxysvr-groups/${id}`, { method: 'DELETE' });
}
