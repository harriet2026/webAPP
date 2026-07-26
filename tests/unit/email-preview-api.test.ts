import { describe, it, expect, vi, beforeEach } from 'vitest';
import { apiRequest } from '@/lib/api/client';

vi.mock('@/lib/api/client', () => ({
  apiRequest: vi.fn(),
}));

const mockApiRequest = vi.mocked(apiRequest);

import { getQuarantinePreview, downloadQuarantineEmail } from '@/lib/api/quarantine';
import { getOutboundAuditPreview, downloadOutboundAuditEmail } from '@/lib/api/audit-queue';
import { getSidelinePreview, downloadSidelineEmail } from '@/lib/api/sideline';

describe('Email Preview API Clients', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('getQuarantinePreview', () => {
    it('calls correct endpoint', async () => {
      const mockResponse = {
        message_id: '<test@example.com>',
        subject: 'Test',
        from: 'sender@example.com',
        from_name: 'Sender',
        to: [{ addr: 'rcpt@example.com', name: '', dn: 'example.com', isto: true }],
        cc: [],
        text_body: 'Hello',
        html_body: '<p>Hello</p>',
        attachments: [],
        urls: [],
        headers: { 'Content-Type': 'text/html' },
      };
      mockApiRequest.mockResolvedValueOnce(mockResponse);

      const result = await getQuarantinePreview(42);

      expect(mockApiRequest).toHaveBeenCalledWith('/quarantine/42/preview');
      expect(result.subject).toBe('Test');
      expect(result.html_body).toBe('<p>Hello</p>');
      expect(result.attachments).toEqual([]);
    });
  });

  describe('getOutboundAuditPreview', () => {
    it('calls correct endpoint', async () => {
      mockApiRequest.mockResolvedValueOnce({ subject: 'Audit Test', html_body: '<p>Audit</p>' });

      const result = await getOutboundAuditPreview(7);

      expect(mockApiRequest).toHaveBeenCalledWith('/outbound-audit/7/preview');
      expect(result.subject).toBe('Audit Test');
    });
  });

  describe('getSidelinePreview', () => {
    it('calls correct endpoint', async () => {
      mockApiRequest.mockResolvedValueOnce({ subject: 'Sideline Test', html_body: '<p>Sideline</p>' });

      const result = await getSidelinePreview('abc-123');

      expect(mockApiRequest).toHaveBeenCalledWith('/sideline/abc-123/preview');
      expect(result.subject).toBe('Sideline Test');
    });
  });

  describe('downloadQuarantineEmail', () => {
    it('calls correct download endpoint', async () => {
      const mockBlob = new Blob(['email content'], { type: 'message/rfc822' });
      vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce({
        ok: true,
        blob: () => Promise.resolve(mockBlob),
      }));
      vi.stubGlobal('localStorage', {
        getItem: () => 'test-token',
        setItem: () => {},
        removeItem: () => {},
      });

      const result = await downloadQuarantineEmail(42);

      expect(result).toBe(mockBlob);

      vi.restoreAllMocks();
    });
  });

  describe('downloadOutboundAuditEmail', () => {
    it('calls correct download endpoint', async () => {
      const mockBlob = new Blob(['audit email'], { type: 'message/rfc822' });
      vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce({
        ok: true,
        blob: () => Promise.resolve(mockBlob),
      }));
      vi.stubGlobal('localStorage', {
        getItem: () => 'test-token',
        setItem: () => {},
        removeItem: () => {},
      });

      const result = await downloadOutboundAuditEmail(7);

      expect(result).toBe(mockBlob);

      vi.restoreAllMocks();
    });
  });

  describe('downloadSidelineEmail', () => {
    it('calls correct download endpoint', async () => {
      const mockBlob = new Blob(['sideline email'], { type: 'message/rfc822' });
      vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce({
        ok: true,
        blob: () => Promise.resolve(mockBlob),
      }));
      vi.stubGlobal('localStorage', {
        getItem: () => 'test-token',
        setItem: () => {},
        removeItem: () => {},
      });

      const result = await downloadSidelineEmail('abc-123');

      expect(result).toBe(mockBlob);

      vi.restoreAllMocks();
    });
  });
});
