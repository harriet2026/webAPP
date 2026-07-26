export type ContactStatus = 'active' | 'stale' | string;
export type ContactTag = 'none' | 'executive' | 'key_position' | string;

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

export interface ContactListParams {
  keyword?: string;
  dept?: string;
  job_title?: string;
  source_id?: number;
  tag?: string;
  page?: number;
  page_size?: number;
}

export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page?: number;
  page_size?: number;
}
