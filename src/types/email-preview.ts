export interface EmailPreviewRecipient {
  addr: string;
  name: string;
  dn: string;
  isto: boolean;
}

export interface EmailPreviewAttachment {
  filename: string;
  size: number;
  md5sum: string;
  content_type: string;
  inline: boolean;
  content_length: number;
}

export interface EmailPreviewResponse {
  message_id: string;
  subject: string;
  from: string;
  from_name?: string;
  to: EmailPreviewRecipient[] | null;
  cc: EmailPreviewRecipient[] | null;
  text_body: string;
  html_body: string;
  attachments: EmailPreviewAttachment[] | null;
  urls: string[] | null;
  headers: Record<string, string>;
  parse_error?: string;
}
