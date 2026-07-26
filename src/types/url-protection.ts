export type Direction = 'receive' | 'send' | 'internal';
export type SandboxMaliciousAction = 'isolate' | 'block' | 'mark' | 'discard';
export type SandboxTimeoutAction = 'continue' | 'treat_malicious' | 'pass';
export type DeepInspectTimeoutPolicy = 'block' | 'allow' | 'hold';

export interface SandboxDirectionConfig {
  enabled: boolean;
  malicious_action: SandboxMaliciousAction;
  timeout_action: SandboxTimeoutAction;
  local_intel_enabled: boolean;
  intel_cleanup_days: number;
  cloud_intel_enabled: boolean;
}

export type SandboxConfigMap = Partial<Record<Direction, SandboxDirectionConfig>>;

export interface URLProtectionSettings {
  public_base_url: string;
  // 后端存 JSON 字符串（sandbox_config JSONB 列的透传）；前端用 parseSandboxConfig 解析。
  sandbox_config?: string | null;
  rescan_blacklist: boolean;
  rescan_query_intel: boolean;
  rescan_deep_inspect: boolean;
  deep_inspect_timeout_sec: number;
  deep_inspect_timeout_policy: DeepInspectTimeoutPolicy;
  allow_user_skip_deep_inspect: boolean;
}
