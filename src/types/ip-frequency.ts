export type IPFrequencyScopeType = 'all' | 'single' | 'range' | 'group';
export type IPFrequencyAction = 'reject' | 'tempfail' | 'disconnect';

export interface IPFrequencyRulePayload {
  name: string;
  description?: string;
  priority: number;
  scope_type: IPFrequencyScopeType;
  scope_value?: string;
  action: IPFrequencyAction;
  daily_connection_limit: number;
  concurrent_connection_limit: number;
  window_minutes: number;
  window_connection_limit: number;
  hourly_auth_failure_limit: number;
  single_connection_command_error_limit: number;
  single_connection_auth_failure_limit: number;
  suspend_minutes: number;
  tempfail_message?: string;
  is_active?: boolean;
  valid_from?: string;
  valid_until?: string;
}

export interface IPFrequencyRuleView {
  Rule: {
    id: number;
    name: string;
    description: string;
    priority: number;
    action: string;
    is_active: boolean;
    valid_from: string | null;
    valid_until: string | null;
    created_at: string;
    updated_at: string;
  };
  ScopeType: string;
  ScopeValue: string;
  DailyConnectionLimit: number;
  ConcurrentConnectionLimit: number;
  WindowMinutes: number;
  WindowConnectionLimit: number;
  HourlyAuthFailureLimit: number;
  SingleConnectionCommandErrorLimit: number;
  SingleConnectionAuthFailureLimit: number;
  SuspendMinutes: number;
  TempfailMessage: string;
  IsExpired: boolean;
}

export interface SuspendedIP {
  ip: string;
  rule_id: number;
  rule_name: string;
  action: string;
  suspended_at: string;
  expires_at: string;
  reason: string;
}

export interface IPFrequencyTestRequest {
  name: string;
  priority: number;
  scope_type: IPFrequencyScopeType;
  scope_value?: string;
  action: IPFrequencyAction;
  daily_connection_limit: number;
  concurrent_connection_limit: number;
  window_minutes: number;
  window_connection_limit: number;
  hourly_auth_failure_limit: number;
  single_connection_command_error_limit: number;
  single_connection_auth_failure_limit: number;
  suspend_minutes: number;
  tempfail_message?: string;
  test_ip: string;
}

export interface IPFrequencyTestResponse {
  blocked: boolean;
  action: string;
  product_action: string;
  reason: string;
  tempfail_code?: number;
  tempfail_msg?: string;
}

export const IPFrequencyActionKeys: Record<IPFrequencyAction, string> = {
  reject: 'ipFrequency.actionReject',
  tempfail: 'ipFrequency.actionTempfail',
  disconnect: 'ipFrequency.actionDisconnect',
};
