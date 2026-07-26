export interface ProxysvrEndpoint {
  id: number;
  name: string;
  host: string;
  port: number;
  presend_code: number;
  lid: string;
  /** 后端指示 license_enc 是否已配置；明文/密文永不下发。 */
  license_present: boolean;
  is_active: boolean;
}

export interface ProxysvrEndpointRequest {
  name: string;
  host: string;
  port: number;
  presend_code: number;
  lid: string;
  /** 明文 license；update 时省略 = 保持原值不变。绝不回显存储值。 */
  license?: string;
  is_active: boolean;
}

export interface ProxysvrGroupMember {
  endpoint_id: number;
  /** failover 顺序，小者先 */
  ord: number;
}

export interface ProxysvrGroup {
  id: number;
  name: string;
  is_active: boolean;
  /** 后端按 (ord, endpoint_id) 升序返回 */
  members: ProxysvrGroupMember[];
}

export interface ProxysvrGroupRequest {
  name: string;
  is_active: boolean;
  members: ProxysvrGroupMember[];
}

export interface ProxysvrEndpointListResponse {
  items: ProxysvrEndpoint[];
  total: number;
  page: number;
  page_size: number;
}

export interface ProxysvrGroupListResponse {
  items: ProxysvrGroup[];
  total: number;
  page: number;
  page_size: number;
}
