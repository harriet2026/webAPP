export type MailSystemType = 'coremail' | 'exchange' | 'standard_smtp';

export interface ExchangeConfig {
  ews_endpoint: string;
  admin_email: string;
  admin_password: string;
  auth_type: 'ntlm' | 'basic' | 'oauth2';
  ssl_verify: boolean;
  max_search_days: number;
  timeout_seconds: number;
  max_retries: number;
}

export interface TenantDomain {
  id: number;
  tenant_id: number;
  domain: string;
  next_hop_type: 'domain' | 'ip';
  next_hop_host: string;
  next_hop_port: number;
  is_active: number;
  mail_system_type: MailSystemType;
  mail_system_config?: ExchangeConfig | null;
}

export const MAIL_SYSTEM_TYPE_LABELS: Record<MailSystemType, string> = {
  coremail:      'Coremail',
  exchange:      'Exchange',
  standard_smtp: '标准 SMTP',
};

export const MAIL_SYSTEM_TYPE_TOOLTIP = `Coremail: 通过 Coremail 召回 Agent 直接在 Coremail 服务器删除邮件
Exchange: 通过 EWS 协议从用户 Exchange 邮箱中移除邮件,需填写下方 EWS 连接参数
标准 SMTP: 通用 SMTP 投递目标,邮件离开本网关后无召回通道,召回功能将不可用`;
