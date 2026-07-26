import { describe, expect, it } from 'vitest';
import type { LinkAttachmentStats } from '@/lib/api/link-attachment-security';
import { dispatch, isMockable } from './dispatcher';

describe('link and attachment security mock coverage', () => {
  it('covers every endpoint used by the approved page actions', () => {
    expect(isMockable('GET', '/statistics/link-attachment-security?direction=all')).toBe(true);
    expect(isMockable('GET', '/statistics/link-attachment-security/top-malicious-domains?limit=5')).toBe(true);
    expect(isMockable('GET', '/statistics/link-attachment-security/top-malicious-attachments?limit=5')).toBe(true);
    expect(isMockable('POST', '/statistics/link-attachment-security/blacklist-domain')).toBe(true);
    expect(isMockable('GET', '/statistics/link-attachment-security/export.csv')).toBe(true);
  });

  it('returns the deterministic prototype dataset and both detail views', () => {
    const stats = dispatch({
      method: 'GET',
      path: '/statistics/link-attachment-security?direction=all',
    }).data as LinkAttachmentStats;

    expect(stats.kpi).toEqual({
      total_link_mail: 66483,
      link_detection_rate: 2.9,
      total_attachment_mail: 84164,
      attachment_detection_rate: 0.7,
    });
    expect(stats.trend.link).toHaveLength(7);
    expect(stats.trend.attachment).toHaveLength(7);
    expect(stats.detail_table.link).toHaveLength(7);
    expect(stats.detail_table.attachment).toHaveLength(7);
    expect(stats.link_distributions.reputation).toHaveLength(5);
    expect(stats.sandbox_async_malicious_count).toBe(7);
  });

  it('honors top-list limits and returns downloadable CSV data', () => {
    const domains = dispatch({
      method: 'GET',
      path: '/statistics/link-attachment-security/top-malicious-domains?limit=3',
    }).data as { items: unknown[] };
    const attachments = dispatch({
      method: 'GET',
      path: '/statistics/link-attachment-security/top-malicious-attachments?limit=4',
    }).data as { items: unknown[] };
    const csv = dispatch({
      method: 'GET',
      path: '/statistics/link-attachment-security/export.csv',
    }).data;

    expect(domains.items).toHaveLength(3);
    expect(attachments.items).toHaveLength(4);
    expect(csv).toContain('date,total_link_mail,malicious_link_mail');
  });
});
