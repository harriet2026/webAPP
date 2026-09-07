import type { ApiRequestFn } from './client';

const API_MAX_PAGE_SIZE = 100;
const MAX_PAGE_REQUESTS = 200;

interface PageResponse<T> {
  items?: T[];
  total?: number;
  page_size?: number;
}

function paginatedPath(path: string, page: number): string {
  const separator = path.indexOf('?');
  const pathname = separator === -1 ? path : path.slice(0, separator);
  const query = new URLSearchParams(separator === -1 ? '' : path.slice(separator + 1));
  const legacyNamespace = query.get('page');
  if (legacyNamespace && !/^\d+$/.test(legacyNamespace)) {
    throw new Error('non-numeric page namespaces must use rule_page before pagination');
  }
  query.set('page', String(page));
  query.set('page_size', String(API_MAX_PAGE_SIZE));
  return `${pathname}?${query.toString()}`;
}

/**
 * Read every page from a standard collection endpoint without bypassing the
 * API-wide page_size=100 contract. A response without total is treated as an
 * unpaginated compatibility response and returned after the first request.
 */
export async function fetchAllPages<T>(
  path: string,
  requestFn: ApiRequestFn,
): Promise<T[]> {
  const items: T[] = [];

  for (let page = 1; page <= MAX_PAGE_REQUESTS; page += 1) {
    const response = await requestFn<PageResponse<T>>(paginatedPath(path, page));
    items.push(...(response.items ?? []));

    if (!Number.isInteger(response.total) || (response.total ?? -1) < 0) {
      return items;
    }

    const effectivePageSize = Number.isInteger(response.page_size) && (response.page_size ?? 0) > 0
      ? response.page_size as number
      : API_MAX_PAGE_SIZE;
    const totalPages = Math.max(1, Math.ceil((response.total ?? 0) / effectivePageSize));
    if (page >= totalPages) {
      return items;
    }
  }

  throw new Error(`paginated collection exceeds ${MAX_PAGE_REQUESTS * API_MAX_PAGE_SIZE} items`);
}
