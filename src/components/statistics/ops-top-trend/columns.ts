import type { LucideIcon } from 'lucide-react';
import { Globe, Shield, Send, FileText, User, Users } from 'lucide-react';

export type DimensionType = 'connection' | 'auth' | 'sendIp' | 'subject' | 'sender' | 'recipient';

export type DrillSubDimType =
  | 'authRecord'
  | 'senderTop'
  | 'subjectTop'
  | 'recipientTop'
  | 'sendIpTop'
  | 'authFailReason'
  | 'connectionRecord'
  | 'threatTypeDistrib'
  | 'bounceReason'
  | 'attackTypeDistrib';

export interface DimensionConfigEntry {
  icon: LucideIcon;
  color: string;
  labelKey: string;
  tipKey: string;
  yAxisLabel: string;
}

export const DIMENSION_CONFIG: Record<DimensionType, DimensionConfigEntry> = {
  connection: { icon: Globe, color: '#1890FF', labelKey: 'dimConnection', tipKey: 'dimConnectionTip', yAxisLabel: 'yAxisConnection' },
  auth: { icon: Shield, color: '#13C2C2', labelKey: 'dimAuth', tipKey: 'dimAuthTip', yAxisLabel: 'yAxisAuth' },
  sendIp: { icon: Send, color: '#52C41A', labelKey: 'dimSendIp', tipKey: 'dimSendIpTip', yAxisLabel: 'yAxisSendIp' },
  subject: { icon: FileText, color: '#FAAD14', labelKey: 'dimSubject', tipKey: 'dimSubjectTip', yAxisLabel: 'yAxisSubject' },
  sender: { icon: User, color: '#722ED1', labelKey: 'dimSender', tipKey: 'dimSenderTip', yAxisLabel: 'yAxisSender' },
  recipient: { icon: Users, color: '#F5222D', labelKey: 'dimRecipient', tipKey: 'dimRecipientTip', yAxisLabel: 'yAxisRecipient' },
};

export type LeftColAlign = 'left' | 'right' | 'center';
export type LeftColType = 'text' | 'number' | 'badge' | 'progress' | 'change' | 'sparkline';

export interface LeftColDef {
  key: string;
  labelKey: string;
  tipKey: string;
  width: string;
  align: LeftColAlign;
  type: LeftColType;
}

export const LEFT_PANEL_COLUMNS: Record<DimensionType, LeftColDef[]> = {
  connection: [
    { key: 'sourceIp', labelKey: 'leftCol.sourceIp', tipKey: 'leftColTip.sourceIp', width: '130px', align: 'left', type: 'text' },
    { key: 'geoLocation', labelKey: 'leftCol.geoLocation', tipKey: 'leftColTip.geoLocation', width: '100px', align: 'left', type: 'badge' },
    { key: 'totalConn', labelKey: 'leftCol.totalConn', tipKey: 'leftColTip.totalConn', width: '100px', align: 'right', type: 'number' },
    { key: 'successCount', labelKey: 'leftCol.successCount', tipKey: 'leftColTip.successCount', width: '90px', align: 'right', type: 'number' },
    { key: 'failureCount', labelKey: 'leftCol.failureCount', tipKey: 'leftColTip.failureCount', width: '90px', align: 'right', type: 'number' },
    { key: 'failureRate', labelKey: 'leftCol.failureRate', tipKey: 'leftColTip.failureRate', width: '90px', align: 'right', type: 'progress' },
    { key: 'firstConn', labelKey: 'leftCol.firstConn', tipKey: 'leftColTip.firstConn', width: '110px', align: 'left', type: 'text' },
    { key: 'lastConn', labelKey: 'leftCol.lastConn', tipKey: 'leftColTip.lastConn', width: '110px', align: 'left', type: 'text' },
    { key: 'change', labelKey: 'leftCol.change', tipKey: 'leftColTip.changeConn', width: '80px', align: 'right', type: 'change' },
    { key: 'trend', labelKey: 'leftCol.trend', tipKey: 'leftColTip.trend', width: '60px', align: 'center', type: 'sparkline' },
    // The derived session-caliber metric remains available without shifting the
    // prototype's primary operational columns in the initial viewport.
    { key: 'avgMessagesPerConnection', labelKey: 'leftCol.avgMessagesPerConnection', tipKey: 'leftColTip.avgMessagesPerConnection', width: '120px', align: 'right', type: 'number' },
  ],
  auth: [
    { key: 'sourceIp', labelKey: 'leftCol.sourceIp', tipKey: 'leftColTip.sourceIpAuth', width: '130px', align: 'left', type: 'text' },
    { key: 'authAccount', labelKey: 'leftCol.authAccount', tipKey: 'leftColTip.authAccount', width: '150px', align: 'left', type: 'text' },
    { key: 'authCount', labelKey: 'leftCol.authCount', tipKey: 'leftColTip.authCount', width: '100px', align: 'right', type: 'number' },
    { key: 'successCount', labelKey: 'leftCol.successCount', tipKey: 'leftColTip.authSuccess', width: '90px', align: 'right', type: 'number' },
    { key: 'failureCount', labelKey: 'leftCol.failureCount', tipKey: 'leftColTip.authFailure', width: '90px', align: 'right', type: 'number' },
    { key: 'failReason', labelKey: 'leftCol.failReason', tipKey: 'leftColTip.failReason', width: '120px', align: 'left', type: 'badge' },
    { key: 'bruteForce', labelKey: 'leftCol.bruteForce', tipKey: 'leftColTip.bruteForce', width: '100px', align: 'center', type: 'badge' },
    { key: 'firstAuth', labelKey: 'leftCol.firstAuth', tipKey: 'leftColTip.firstAuth', width: '110px', align: 'left', type: 'text' },
    { key: 'change', labelKey: 'leftCol.change', tipKey: 'leftColTip.changeAuth', width: '80px', align: 'right', type: 'change' },
    { key: 'trend', labelKey: 'leftCol.trend', tipKey: 'leftColTip.trend', width: '60px', align: 'center', type: 'sparkline' },
  ],
  sendIp: [
    { key: 'sourceIp', labelKey: 'leftCol.sourceIp', tipKey: 'leftColTip.sourceIpSend', width: '130px', align: 'left', type: 'text' },
    { key: 'geoLocation', labelKey: 'leftCol.geoLocation', tipKey: 'leftColTip.geoLocation', width: '100px', align: 'left', type: 'badge' },
    { key: 'sendCount', labelKey: 'leftCol.sendCount', tipKey: 'leftColTip.sendCount', width: '100px', align: 'right', type: 'number' },
    { key: 'threatCount', labelKey: 'leftCol.threatCount', tipKey: 'leftColTip.threatCount', width: '100px', align: 'right', type: 'number' },
    { key: 'blockRate', labelKey: 'leftCol.blockRate', tipKey: 'leftColTip.blockRate', width: '90px', align: 'right', type: 'progress' },
    { key: 'bounceCount', labelKey: 'leftCol.bounceCount', tipKey: 'leftColTip.bounceCount', width: '90px', align: 'right', type: 'number' },
    { key: 'relatedSenders', labelKey: 'leftCol.relatedSenders', tipKey: 'leftColTip.relatedSenders', width: '110px', align: 'right', type: 'number' },
    { key: 'firstSend', labelKey: 'leftCol.firstSend', tipKey: 'leftColTip.firstSend', width: '110px', align: 'left', type: 'text' },
    { key: 'change', labelKey: 'leftCol.change', tipKey: 'leftColTip.changeSend', width: '80px', align: 'right', type: 'change' },
    { key: 'trend', labelKey: 'leftCol.trend', tipKey: 'leftColTip.trend', width: '60px', align: 'center', type: 'sparkline' },
  ],
  subject: [
    { key: 'subjectKeyword', labelKey: 'leftCol.subjectKeyword', tipKey: 'leftColTip.subjectKeyword', width: '200px', align: 'left', type: 'text' },
    { key: 'occurCount', labelKey: 'leftCol.occurCount', tipKey: 'leftColTip.occurCount', width: '100px', align: 'right', type: 'number' },
    { key: 'relatedThreatType', labelKey: 'leftCol.relatedThreatType', tipKey: 'leftColTip.relatedThreatType', width: '130px', align: 'left', type: 'badge' },
    { key: 'targetCount', labelKey: 'leftCol.targetCount', tipKey: 'leftColTip.targetCount', width: '110px', align: 'right', type: 'number' },
    { key: 'blockRate', labelKey: 'leftCol.blockRate', tipKey: 'leftColTip.blockRateSubject', width: '90px', align: 'right', type: 'progress' },
    { key: 'deliveryRate', labelKey: 'leftCol.deliveryRate', tipKey: 'leftColTip.deliveryRate', width: '90px', align: 'right', type: 'progress' },
    { key: 'firstSeen', labelKey: 'leftCol.firstSeen', tipKey: 'leftColTip.firstSeen', width: '110px', align: 'left', type: 'text' },
    { key: 'change', labelKey: 'leftCol.change', tipKey: 'leftColTip.changeSubject', width: '80px', align: 'right', type: 'change' },
    { key: 'trend', labelKey: 'leftCol.trend', tipKey: 'leftColTip.trend', width: '60px', align: 'center', type: 'sparkline' },
  ],
  sender: [
    { key: 'senderEmail', labelKey: 'leftCol.senderEmail', tipKey: 'leftColTip.senderEmail', width: '180px', align: 'left', type: 'text' },
    { key: 'senderDomain', labelKey: 'leftCol.senderDomain', tipKey: 'leftColTip.senderDomain', width: '130px', align: 'left', type: 'text' },
    { key: 'sendCount', labelKey: 'leftCol.sendCount', tipKey: 'leftColTip.sendCountSender', width: '100px', align: 'right', type: 'number' },
    { key: 'threatCount', labelKey: 'leftCol.threatCount', tipKey: 'leftColTip.threatCountSender', width: '100px', align: 'right', type: 'number' },
    { key: 'blockRate', labelKey: 'leftCol.blockRate', tipKey: 'leftColTip.blockRateSender', width: '90px', align: 'right', type: 'progress' },
    { key: 'bounceRate', labelKey: 'leftCol.bounceRate', tipKey: 'leftColTip.bounceRate', width: '90px', align: 'right', type: 'progress' },
    { key: 'topSendIps', labelKey: 'leftCol.topSendIps', tipKey: 'leftColTip.topSendIps', width: '130px', align: 'left', type: 'text' },
    { key: 'firstSend', labelKey: 'leftCol.firstSend', tipKey: 'leftColTip.firstSendSender', width: '110px', align: 'left', type: 'text' },
    { key: 'change', labelKey: 'leftCol.change', tipKey: 'leftColTip.changeSender', width: '80px', align: 'right', type: 'change' },
    { key: 'trend', labelKey: 'leftCol.trend', tipKey: 'leftColTip.trend', width: '60px', align: 'center', type: 'sparkline' },
  ],
  recipient: [
    { key: 'recipientEmail', labelKey: 'leftCol.recipientEmail', tipKey: 'leftColTip.recipientEmail', width: '180px', align: 'left', type: 'text' },
    { key: 'recipientDomain', labelKey: 'leftCol.recipientDomain', tipKey: 'leftColTip.recipientDomain', width: '130px', align: 'left', type: 'text' },
    { key: 'receiveCount', labelKey: 'leftCol.receiveCount', tipKey: 'leftColTip.receiveCount', width: '100px', align: 'right', type: 'number' },
    { key: 'threatCount', labelKey: 'leftCol.threatCount', tipKey: 'leftColTip.threatCountRecipient', width: '100px', align: 'right', type: 'number' },
    { key: 'attackCount', labelKey: 'leftCol.attackCount', tipKey: 'leftColTip.attackCount', width: '100px', align: 'right', type: 'number' },
    { key: 'blockRate', labelKey: 'leftCol.blockRate', tipKey: 'leftColTip.blockRateRecipient', width: '90px', align: 'right', type: 'progress' },
    { key: 'mainThreatType', labelKey: 'leftCol.mainThreatType', tipKey: 'leftColTip.mainThreatType', width: '120px', align: 'left', type: 'badge' },
    { key: 'department', labelKey: 'leftCol.department', tipKey: 'leftColTip.department', width: '100px', align: 'left', type: 'badge' },
    { key: 'change', labelKey: 'leftCol.change', tipKey: 'leftColTip.changeRecipient', width: '80px', align: 'right', type: 'change' },
    { key: 'trend', labelKey: 'leftCol.trend', tipKey: 'leftColTip.trend', width: '60px', align: 'center', type: 'sparkline' },
  ],
};

export interface DrillDownConfigEntry {
  subDims: DrillSubDimType[];
  titleKey: string;
  emptyKey: string;
}

export const DRILL_DOWN_CONFIG: Record<DimensionType, DrillDownConfigEntry> = {
  connection: {
    subDims: ['authRecord', 'senderTop', 'subjectTop', 'recipientTop'],
    titleKey: 'drillTitleConnection',
    emptyKey: 'emptyConnection',
  },
  auth: {
    subDims: ['sendIpTop', 'senderTop', 'subjectTop', 'authFailReason'],
    titleKey: 'drillTitleAuth',
    emptyKey: 'emptyAuth',
  },
  sendIp: {
    subDims: ['senderTop', 'subjectTop', 'recipientTop', 'connectionRecord'],
    titleKey: 'drillTitleSendIp',
    emptyKey: 'emptySendIp',
  },
  subject: {
    subDims: ['senderTop', 'sendIpTop', 'recipientTop', 'threatTypeDistrib'],
    titleKey: 'drillTitleSubject',
    emptyKey: 'emptySubject',
  },
  sender: {
    subDims: ['sendIpTop', 'subjectTop', 'recipientTop', 'bounceReason'],
    titleKey: 'drillTitleSender',
    emptyKey: 'emptySender',
  },
  recipient: {
    subDims: ['senderTop', 'sendIpTop', 'subjectTop', 'attackTypeDistrib'],
    titleKey: 'drillTitleRecipient',
    emptyKey: 'emptyRecipient',
  },
};

export const SUB_DIM_LABELS: Record<DrillSubDimType, string> = {
  authRecord: 'subDimAuthRecord',
  senderTop: 'subDimSenderTop',
  subjectTop: 'subDimSubjectTop',
  recipientTop: 'subDimRecipientTop',
  sendIpTop: 'subDimSendIpTop',
  authFailReason: 'subDimAuthFailReason',
  connectionRecord: 'subDimConnectionRecord',
  threatTypeDistrib: 'subDimThreatTypeDistrib',
  bounceReason: 'subDimBounceReason',
  attackTypeDistrib: 'subDimAttackTypeDistrib',
};

export const DIR_APPLICABLE: Record<DimensionType, boolean> = {
  connection: true,
  auth: false,
  sendIp: false,
  subject: true,
  sender: true,
  recipient: true,
};

// Fixed backend direction for dimensions that don't accept user direction input.
// sendIp always queries direction='send'.
// auth has no direction concept.
export const DIR_FIXED: Partial<Record<DimensionType, 'receive' | 'send'>> = {
  sendIp: 'send',
};
