import type { MailMarkingMetadata, MarkColorSet } from './types'

export const DEFAULT_CUSTOM_COLORS: MarkColorSet = {
  bg: '#FFF3E0',
  text: '#E65100',
  border: '#FF9800',
  radius: 4,
}

export const DEFAULT_RECEIVE_METADATA: MailMarkingMetadata = {
  feature: 'mail_marking',
  direction: 'receive',
  departments: [],
  groups: [],
  mark: {
    text: '【外站邮件】',
    positions: ['body_top'],
    style: 'blue_tag',
  },
}

export const DEFAULT_SEND_METADATA: MailMarkingMetadata = {
  feature: 'mail_marking',
  direction: 'send',
  departments: [],
  groups: [],
  disclaimer: {
    content: '',
    positions: ['body_bottom'],
    format: 'auto',
  },
}

export const MARK_POSITION_OPTIONS = ['subject_prefix', 'body_top', 'header'] as const
export const DISCLAIMER_POSITION_OPTIONS = ['body_top', 'body_bottom', 'header'] as const
export const MARK_STYLE_OPTIONS = ['blue_tag', 'orange_warning', 'plain_text', 'custom'] as const
export const DISCLAIMER_FORMAT_OPTIONS = ['auto', 'html_only', 'plain_only'] as const

export const RECEIVE_MARKING_VARIABLES = [
  'sender_domain',
  'sender_ip',
  'recipient_name',
  'date',
] as const

export const SEND_DISCLAIMER_VARIABLES = [
  'sender_name',
  'sender_email',
  'organization',
  'date',
  'time',
  'legal_contact',
] as const

export const MAIL_MARKING_VARIABLES = [
  ...RECEIVE_MARKING_VARIABLES,
  'sender_name',
  'sender_email',
  'organization',
  'time',
  'legal_contact',
] as const
