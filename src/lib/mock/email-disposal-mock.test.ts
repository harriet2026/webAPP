import { describe, expect, it } from 'vitest';
import {
  mockEmailDisposalDetail,
  mockEmailDisposalEvents,
  mockEmailDisposalFields,
  mockEmailDisposalList,
  mockEmailDisposalMutate,
  mockEmailDisposalPreview,
} from './fixtures';

describe('email disposal center mock contract', () => {
  it('provides the exact 52-row demo dataset and 30 advanced fields', () => {
    // GT-12649: +2 阶段1（IPBL/RBL 平台策略）示例行 MIC026/MIC027；
    // demo 合入: +25 跨页选中/全量导出验证行（顺延编号 MIC028-MIC052）。
    const result = mockEmailDisposalList('/mail-logs?page=1&page_size=100');
    expect(result.total).toBe(52);
    expect(result.items).toHaveLength(52);
    expect(result.items[0]).toMatchObject({ tid: 'MIC001', subject: 'Q2财务报表 - 紧急审批（多投信）' });
    expect(mockEmailDisposalFields()).toHaveLength(30);
  });

  it('evaluates AND/OR advanced filters against fixture values', () => {
    const advanced = encodeURIComponent(JSON.stringify({
      operator: 'AND',
      groups: [
        { operator: 'OR', conditions: [
          { field: 'disposal_rule_id', op: 'eq', value: 'CR-045' },
          { field: 'disposal_rule_id', op: 'eq', value: 'CR-012' },
        ] },
        { operator: 'AND', conditions: [{ field: 'sender', op: 'ends_with', value: 'company.com' }] },
      ],
    }));
    const result = mockEmailDisposalList(`/mail-logs?page=1&page_size=100&advanced_filters=${advanced}`);
    expect(result.total).toBeGreaterThan(0);
    expect(result.items.every((item) => item.sender.endsWith('company.com'))).toBe(true);
    expect(result.items.every((item) => ['CR-045', 'CR-012'].includes(item.disposal_basis?.rule_id ?? ''))).toBe(true);
  });

  it('provides stable detail, preview, and event endpoints', () => {
    expect(mockEmailDisposalDetail(1)?.recipient_dispositions).toHaveLength(5);
    expect(mockEmailDisposalPreview(1)?.headers['X-Mock-TID']).toBe('MIC001');
    // 4 个通用事件（connected/message_received/policy_decided/最终状态）+ 5
    // 个逐收件人投递事件（Task 12 item 7）。
    expect(mockEmailDisposalEvents(1)).toMatchObject({ total: 9, page_size: 100 });
  });

  it('distributes MIC001 (5-recipient 高管仿冒/Q2财务报表) statuses one-per-recipient, mirroring the demo generateRecipientStatus() distribution, and gates object_id on operability', () => {
    const detail = mockEmailDisposalDetail(1);
    const dispositions = detail?.recipient_dispositions ?? [];
    expect(dispositions.map((d) => d.status)).toEqual([
      'delivered', 'quarantined', 'pending_review', 'blocked', 'discarded',
    ]);
    // Operable statuses (delivered/quarantined/pending_review) carry a stable
    // object_id so recipient-level dispose buttons render; blocked/discarded
    // (no original content, matching demo canOperate=false) carry none.
    expect(dispositions[0].object_id).toBe('obj-1-0');
    expect(dispositions[1].object_id).toBe('obj-1-1');
    expect(dispositions[2].object_id).toBe('obj-1-2');
    expect(dispositions[3].object_id).toBeUndefined();
    expect(dispositions[4].object_id).toBeUndefined();
  });

  it('every recipient gets a stable object_id when operable, keeping recipients.length === recipient_dispositions.length (single-recipient dispose gate)', () => {
    for (const item of mockEmailDisposalList('/mail-logs?page=1&page_size=100').items) {
      const detail = mockEmailDisposalDetail(item.id);
      expect(detail?.recipient_dispositions).toHaveLength(detail!.recipients.length);
    }
  });

  it('populates entity_urls (evil.com malicious + safe.company.com) and 2 named attachments with a virus-hit scan_result for the MIC001 phishing row', () => {
    const detail = mockEmailDisposalDetail(1);
    expect(detail?.entity_urls).toEqual([
      { url: 'https://evil.com/login', domain: 'evil.com', check_result: 'THREAT', threat_type: 'MALWARE', verdict: 'malicious', vt_score: '47/90' },
      { url: 'https://safe.company.com/x', domain: 'safe.company.com', vt_score: '0/90' },
    ]);
    expect(detail?.attachments?.map((a) => a.filename)).toEqual(['report.pdf', 'invoice.xlsx']);
    expect(detail?.attachments?.every((a) => Boolean(a.md5sum))).toBe(true);
    expect(detail?.scan_results?.some((s) => Boolean(s.virus_name))).toBe(true);
    expect(detail?.spf_valid).toBe('pass');
    expect(detail?.dkim_valid).toBe('fail');
    expect(detail?.dmarc_valid).toBe('softfail');
    expect(detail?.sensitive_keyword_hit).toBe(true);
    expect(detail?.return_path).toBeTruthy();
    expect(detail?.reply_to).toBeTruthy();
    expect(detail?.x_mailer).toBeTruthy();
    expect(detail?.geo_asn).toBeTruthy();
  });

  it('bulk-dispose returns results[] for an object-mode (object_id-scoped) request, and the summary shape for a whole-message request', () => {
    const objectResult = mockEmailDisposalMutate(
      { mail_log_ids: [1], action: 'release', object_id: 'obj-1-0' },
      'bulk',
    ) as { results?: { mail_log_id: number; object_id: string; status: string }[] };
    expect(objectResult.results).toEqual([{ mail_log_id: 1, object_id: 'obj-1-0', status: 'succeeded' }]);

    const bulkResult = mockEmailDisposalMutate({ mail_log_ids: [1], action: 'release' }, 'bulk') as {
      succeeded: number[];
    };
    expect(bulkResult.succeeded).toEqual([1]);
  });

  // RA-5 (demo parity): 隔离/阻断 are mock-only object-mode actions -- the
  // mock dispatcher must recognize them (unlike the real backend, which
  // rejects any action other than release/delete) and actually mutate the
  // targeted recipient's disposition status/final_action, mirroring the
  // demo's immediate in-place state change.
  it('bulk-dispose(quarantine/block) mutates the targeted recipient to quarantined/blocked (mock-only demo-parity actions)', () => {
    const quarantineResult = mockEmailDisposalMutate(
      { mail_log_ids: [1], action: 'quarantine', object_id: 'obj-1-0' },
      'bulk',
    ) as { results?: { mail_log_id: number; object_id: string; status: string }[] };
    expect(quarantineResult.results).toEqual([{ mail_log_id: 1, object_id: 'obj-1-0', status: 'succeeded' }]);
    const afterQuarantine = mockEmailDisposalDetail(1);
    const quarantinedDisposition = afterQuarantine?.recipient_dispositions?.find((d) => d.object_id === 'obj-1-0');
    expect(quarantinedDisposition?.status).toBe('quarantined');
    expect(quarantinedDisposition?.final_action).toBe('quarantine');

    const blockResult = mockEmailDisposalMutate(
      { mail_log_ids: [1], action: 'block', object_id: 'obj-1-1' },
      'bulk',
    ) as { results?: { mail_log_id: number; object_id: string; status: string }[] };
    expect(blockResult.results).toEqual([{ mail_log_id: 1, object_id: 'obj-1-1', status: 'succeeded' }]);
    const afterBlock = mockEmailDisposalDetail(1);
    const blockedDisposition = afterBlock?.recipient_dispositions?.find((d) => d.object_id === 'obj-1-1');
    expect(blockedDisposition?.status).toBe('blocked');
    expect(blockedDisposition?.final_action).toBe('reject');
  });

  it('sorts by received time without mutating the canonical fixture order', () => {
    const ascending = mockEmailDisposalList('/mail-logs?page=1&page_size=100&sort_order=asc');
    expect(ascending.items[0].received_at <= ascending.items.at(-1)!.received_at).toBe(true);
    expect(mockEmailDisposalList('/mail-logs?page=1&page_size=1').items[0].tid).toBe('MIC001');
  });
});
