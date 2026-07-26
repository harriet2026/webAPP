import { describe, it, expect } from 'vitest';
import { exportLinkAttachmentCsvUrl } from './link-attachment-security';

describe('link-attachment-security client', () => {
  it('CSV url includes tenant_id when provided', () => {
    const url = exportLinkAttachmentCsvUrl({
      start_date: '2026-06-01',
      end_date: '2026-06-07',
      direction: 'all',
      tenant_id: 9,
    });
    expect(url).toContain('tenant_id=9');
  });

  it('CSV url omits tenant_id when null or undefined', () => {
    const urlNull = exportLinkAttachmentCsvUrl({
      start_date: '2026-06-01',
      end_date: '2026-06-07',
      direction: 'all',
      tenant_id: null,
    });
    expect(urlNull).not.toContain('tenant_id');

    const urlUndefined = exportLinkAttachmentCsvUrl({
      start_date: '2026-06-01',
      end_date: '2026-06-07',
      direction: 'all',
    });
    expect(urlUndefined).not.toContain('tenant_id');
  });
});
