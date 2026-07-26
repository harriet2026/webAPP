import type { Contact } from '@/types/contacts';
import type {
  SpoofDisposition,
  SpoofPersonCategory,
  SpoofPersonConfig,
  SpoofProtectionLevel,
  SpoofSensitivity,
} from '@/types/spoofing-detection';

export function normalizeSpoofImportEmail(email: string | undefined): string {
  return (email ?? '').trim().toLowerCase();
}

export type SpoofPasteIssueCode = 'format' | 'email' | 'duplicate' | 'existing';

export interface SpoofPasteRow {
  line: number;
  name: string;
  email: string;
}

export interface SpoofPasteIssue {
  line: number;
  code: SpoofPasteIssueCode;
}

export function parseSpoofPersonPaste(
  input: string,
  existingEmails: ReadonlySet<string> = new Set(),
  limit = 20,
): { rows: SpoofPasteRow[]; issues: SpoofPasteIssue[]; count: number; overLimit: boolean } {
  const lines = input.split(/\r?\n/)
    .map((value, index) => ({ value: value.trim(), line: index + 1 }))
    .filter(({ value }) => value.length > 0);
  const rows: SpoofPasteRow[] = [];
  const issues: SpoofPasteIssue[] = [];
  const seen = new Set<string>();

  for (const { value, line } of lines) {
    const fields = value.split(/[,，\t]/).map((field) => field.trim());
    if (fields.length !== 2 || !fields[0] || !fields[1]) {
      issues.push({ line, code: 'format' });
      continue;
    }
    const email = normalizeSpoofImportEmail(fields[1]);
    if (!/^\S+@\S+\.\S+$/.test(email)) {
      issues.push({ line, code: 'email' });
      continue;
    }
    if (seen.has(email)) {
      issues.push({ line, code: 'duplicate' });
      continue;
    }
    seen.add(email);
    if (existingEmails.has(email)) {
      issues.push({ line, code: 'existing' });
      continue;
    }
    rows.push({ line, name: fields[0], email });
  }

  return { rows, issues, count: lines.length, overLimit: lines.length > limit };
}

export function displayNameFromContact(contact: Contact): string {
  const name = contact.display_name?.trim();
  if (name) return name;
  const email = normalizeSpoofImportEmail(contact.email);
  return email.includes('@') ? email.split('@')[0] : email;
}

export function deriveSpoofCategoryFromJobTitle(jobTitle: string | undefined): SpoofPersonCategory {
  const title = (jobTitle ?? '').toLowerCase();
  if (/(ceo|cfo|coo|cto|chief|president|vice president|\bvp\b|director|founder|executive|总裁|总经理|董事|首席|高管|创始)/i.test(title)) {
    return 'executive';
  }
  if (/(finance|financial|accounting|accountant|treasury|cashier|财务|会计|出纳|资金)/i.test(title)) {
    return 'finance';
  }
  if (/(human resources|\bhr\b|recruit|people|人资|人力|招聘)/i.test(title)) {
    return 'hr';
  }
  if (/(engineer|developer|architect|technology|technical|security|\bit\b|研发|开发|技术|运维|安全)/i.test(title)) {
    return 'tech';
  }
  return 'business';
}

export function recommendSensitivityForCategory(category: SpoofPersonCategory): SpoofSensitivity {
  return category === 'executive' || category === 'finance' ? 85 : 75;
}

export function buildSpoofPersonConfigFromContact(contact: Contact, defaults: {
  protectionLevel: SpoofProtectionLevel;
  confidenceThreshold: number;
  disposition: SpoofDisposition;
}): SpoofPersonConfig {
  const category = deriveSpoofCategoryFromJobTitle(contact.job_title);
  return {
    display_name: displayNameFromContact(contact),
    category,
    protection_level: defaults.protectionLevel,
    sensitivity: recommendSensitivityForCategory(category),
    confidence_threshold: defaults.confidenceThreshold,
    legit_emails: [{ email: contact.email.trim(), match_type: 'exact' }],
    disposition: defaults.disposition,
    enabled: true,
    observe_mode: false,
  };
}
