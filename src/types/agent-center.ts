export type AgentCenterKey = 'phishing' | 'spoofing' | 'threat-retro';

export type AgentCenterAccess = 'enabled' | 'locked' | 'hidden';

export type AgentCenterStatus = 'running' | 'paused' | 'locked';

export interface AgentCenterPolicyPage {
  page: string;
  role: string;
  management: string;
}

export interface AgentCenterCard {
  key: AgentCenterKey;
  module_key?: string;
  feature_id: string;
  access: AgentCenterAccess;
  status: AgentCenterStatus;
  stage_position: string;
  policy_pages?: AgentCenterPolicyPage[];
  today_processed: number | null;
  hit_count: number | null;
  processed_count: number | null;
  hit_rate: number | null;
  fallback_count?: number | null;
}

export interface AgentCenterOverview {
  agents: AgentCenterCard[];
}
