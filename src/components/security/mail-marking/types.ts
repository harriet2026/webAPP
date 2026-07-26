export type MailMarkingDirection = 'receive' | 'send'
export type MarkPosition = 'subject_prefix' | 'body_top' | 'header'
export type DisclaimerPosition = 'body_top' | 'body_bottom' | 'header'
export type MarkStyle = 'blue_tag' | 'orange_warning' | 'plain_text' | 'custom'
export type DisclaimerFormat = 'auto' | 'html_only' | 'plain_only'

export interface MarkColorSet {
  bg: string
  text: string
  border: string
  radius: number
}

export interface MarkBlock {
  text: string
  positions: MarkPosition[]
  style: MarkStyle
  custom_colors?: MarkColorSet
  header_name?: string
}

export interface DisclaimerBlock {
  content: string
  positions: DisclaimerPosition[]
  format: DisclaimerFormat
  header_name?: string
}

export interface MailMarkingMetadata {
  feature: 'mail_marking'
  direction: MailMarkingDirection
  /** Stable group keys used by the separate department selector. */
  departments?: string[]
  /** Stable group keys used by the ordinary group selector. */
  groups?: string[]
  mark?: MarkBlock
  disclaimer?: DisclaimerBlock
}

export interface MailMarkingRule {
  id: number
  name: string
  description?: string
  priority: number
  is_active: boolean
  metadata: MailMarkingMetadata
  departments: string[]
  groups: string[]
  direction: MailMarkingDirection
  updated_at?: string
  created_at?: string
}
