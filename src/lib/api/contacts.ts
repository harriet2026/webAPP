import { apiRequest, type ApiRequestFn } from './client';
import type { Contact, ContactListParams, PaginatedResponse } from '@/types/contacts';

function setScalar(q: URLSearchParams, key: string, value: unknown) {
  if (value !== undefined && value !== null && value !== '') q.set(key, String(value));
}

export async function listContacts(
  params: ContactListParams = {},
  fn: ApiRequestFn = apiRequest,
): Promise<PaginatedResponse<Contact>> {
  const q = new URLSearchParams();
  setScalar(q, 'keyword', params.keyword);
  setScalar(q, 'dept', params.dept);
  setScalar(q, 'job_title', params.job_title);
  setScalar(q, 'source_id', params.source_id);
  setScalar(q, 'tag', params.tag);
  setScalar(q, 'page', params.page);
  setScalar(q, 'page_size', params.page_size);
  return fn<PaginatedResponse<Contact>>(`/contacts?${q.toString()}`);
}

// 部门聚合行：组织通讯录没有独立的部门实体，后端从人员的 deptPath 聚合出
// 去重后的部门行（一行 = 一条精确路径，非层级树）。树的派生逻辑见
// `@/lib/org-departments`（buildDepartmentTree 会按 " / " 前缀补全缺失的祖先节点）。
export interface ContactDepartmentRow {
  /** 完整路径，如 "研发部 / 后端组"；作为稳定唯一键 */
  path: string;
  /** 当前层级名称，如 "后端组" */
  name: string;
  /** 父级完整路径；根节点为 null */
  parent_path: string | null;
  /** 直接归属该精确路径（非含子孙）的人数 */
  member_count: number;
  /** 该部门涉及的通讯录同步来源（如 总部 AD、网易企邮） */
  source_names: string[];
}

export async function listContactDepartments(
  fn: ApiRequestFn = apiRequest,
): Promise<{ items: ContactDepartmentRow[] }> {
  return fn<{ items: ContactDepartmentRow[] }>('/contacts/_departments');
}
