/** TLS 最低版本，∈ {1.0,1.1,1.2,1.3}（空串在应用层归一为默认值 "1.2"）。 */
export type ProxysvrTLSMinVersion = '1.0' | '1.1' | '1.2' | '1.3' | '';
/** 加密套件档位，∈ {default,high,compatible}（空串在应用层归一为默认值 "default"）。 */
export type ProxysvrCipherProfile = 'default' | 'high' | 'compatible' | '';
/** 最近一次探测结果，仅探测 API（POST /proxysvr-endpoints/:id/probe）写入。 */
export type ProxysvrProbeStatus = 'normal' | 'abnormal' | 'unchecked';

export interface ProxysvrEndpoint {
  id: number;
  name: string;
  host: string;
  port: number;
  presend_code: number;
  lid: string;
  /** 后端指示 license_enc 是否已配置；明文/密文永不下发。 */
  license_present: boolean;
  use_tls: boolean;
  is_active: boolean;
  /** 出口源 IP（proxysend 连接上游时 bind）；空串=不 bind（沿用系统路由选择）。 */
  egress_ip: string;
  /** EHLO/HELO 声明的主机名；空串=使用系统默认值（mail.gateway.local）。 */
  helo_hostname: string;
  tls_min_version: ProxysvrTLSMinVersion;
  cipher_profile: ProxysvrCipherProfile;
  /**
   * Mixed-version deployments and rows created before the probe columns existed
   * may omit this value; the UI normalizes those records to "unchecked".
   */
  probe_status?: ProxysvrProbeStatus | null;
  /** null=从未探测过。 */
  last_probe_time: string | null;
}

export interface ProxysvrEndpointRequest {
  name: string;
  host: string;
  port: number;
  presend_code: number;
  lid: string;
  /** 明文 license；update 时省略 = 保持原值不变。绝不回显存储值。 */
  license?: string;
  use_tls?: boolean;
  is_active: boolean;
  egress_ip?: string;
  helo_hostname?: string;
  tls_min_version?: ProxysvrTLSMinVersion;
  cipher_profile?: ProxysvrCipherProfile;
}

/** POST /proxysvr-endpoints/:id/probe 的响应。 */
export interface ProxysvrProbeResult {
  probe_status: ProxysvrProbeStatus;
  last_probe_time: string;
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
