import { describe, expect, it } from 'vitest';
import {
  buildSpoofPersonConfigFromContact,
  deriveSpoofCategoryFromJobTitle,
  displayNameFromContact,
  normalizeSpoofImportEmail,
  parseSpoofPersonPaste,
} from './spoofing-person-import';
import type { Contact } from '@/types/contacts';

const baseContact: Contact = {
  id: 1,
  email: ' Alice.Li@Example.COM ',
  display_name: 'Alice Li',
  department_path: 'HQ/Finance',
  job_title: 'CFO',
  tag: 'executive',
  status: 'active',
};

describe('spoofing organization import helpers', () => {
  it('normalizes emails for existing-object checks', () => {
    expect(normalizeSpoofImportEmail(' User@Example.COM ')).toBe('user@example.com');
  });

  it('derives supported categories from job titles', () => {
    expect(deriveSpoofCategoryFromJobTitle('CFO')).toBe('executive');
    expect(deriveSpoofCategoryFromJobTitle('Finance Manager')).toBe('finance');
    expect(deriveSpoofCategoryFromJobTitle('HR Specialist')).toBe('hr');
    expect(deriveSpoofCategoryFromJobTitle('Security Engineer')).toBe('tech');
    expect(deriveSpoofCategoryFromJobTitle('IT Manager')).toBe('tech');
    expect(deriveSpoofCategoryFromJobTitle('Sales')).toBe('business');
  });

  it('falls back display name to email local part', () => {
    expect(displayNameFromContact({ ...baseContact, display_name: '', email: 'bob@example.com' })).toBe('bob');
  });

  it('builds SpoofPersonConfig without persisting contact-only fields', () => {
    const config = buildSpoofPersonConfigFromContact(baseContact, {
      protectionLevel: 'high',
      confidenceThreshold: 82,
      disposition: { mode: 'standard', action: 'quarantine', mark_style: ['subject'], notify: true },
    });

    expect(config).toMatchObject({
      display_name: 'Alice Li',
      category: 'executive',
      protection_level: 'high',
      sensitivity: 85,
      confidence_threshold: 82,
      legit_emails: [{ email: 'Alice.Li@Example.COM', match_type: 'exact' }],
      enabled: true,
      observe_mode: false,
    });
    expect(JSON.stringify(config)).not.toContain('department_path');
    expect(JSON.stringify(config)).not.toContain('job_title');
    expect(JSON.stringify(config)).not.toContain('external_uid');
  });

  it('parses bulk paste and rejects invalid, duplicate, and existing emails', () => {
    const result = parseSpoofPersonPaste([
      'Alice, Alice@Example.com',
      'Bob，bob@example.com',
      'Duplicate,alice@example.com',
      'Existing,existing@example.com',
      'Missing delimiter',
      'Bad,bad-address',
    ].join('\n'), new Set(['existing@example.com']));

    expect(result.rows).toEqual([
      { line: 1, name: 'Alice', email: 'alice@example.com' },
      { line: 2, name: 'Bob', email: 'bob@example.com' },
    ]);
    expect(result.issues).toEqual([
      { line: 3, code: 'duplicate' },
      { line: 4, code: 'existing' },
      { line: 5, code: 'format' },
      { line: 6, code: 'email' },
    ]);
  });

  it('reports the 20-row bulk limit', () => {
    const input = Array.from({ length: 21 }, (_, index) => `User ${index},user-${index}@example.com`).join('\n');
    expect(parseSpoofPersonPaste(input)).toMatchObject({ count: 21, overLimit: true });
  });
});
