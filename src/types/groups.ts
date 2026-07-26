export type GroupType = 'ip' | 'sender' | 'recipient' | 'content' | 'feature';

export interface Group {
  ruleId: number;
  name: string;
  type: GroupType;
  members: string[];
  memberCount: number | null;
  referenceCount: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export const GROUP_TYPE_LABELS: Record<GroupType, string> = {
  ip: 'groups.ipGroup',
  sender: 'groups.senderGroup',
  recipient: 'groups.recipientGroup',
  content: 'groups.contentGroup',
  feature: 'groups.featureGroup',
};

export const GROUP_TYPE_TO_STAGE: Record<GroupType, 'onconnect' | 'mail' | 'rcpt' | 'data'> = {
  ip: 'onconnect',
  sender: 'mail',
  recipient: 'rcpt',
  content: 'data',
  feature: 'data',
};

export const GROUP_TAG_PREFIX = 'grp:';
export const GROUPS_PAGE_KEY = 'groups';
