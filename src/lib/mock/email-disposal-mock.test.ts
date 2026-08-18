import { beforeEach, describe, expect, it } from 'vitest';
import {
  isMockActiveRecallState,
  mockEmailDisposalDetail,
  mockEmailDisposalBlacklistEntity,
  mockEmailDisposalEvents,
  mockEmailDisposalFields,
  mockEmailDisposalList,
  mockEmailDisposalRuleOptions,
  mockEmailDisposalMutate,
  mockEmailDisposalPreview,
  resetMockEmailDisposalStateForTests,
} from './fixtures';

describe('email disposal center mock contract', () => {
  beforeEach(() => {
    resetMockEmailDisposalStateForTests();
  });

  it('provides the exact 53-row demo dataset and 30 advanced fields', () => {
    // GT-12649: +2 阶段1（IPBL/RBL 平台策略）示例行 MIC026/MIC027；
    // demo 合入: +25 跨页选中/全量导出验证行（顺延编号 MIC028-MIC052）。
    // +MIC053 混合处置（mixed）演示行。
    const result = mockEmailDisposalList('/mail-logs?page=1&page_size=100');
    expect(result.total).toBe(53);
    expect(result.items).toHaveLength(53);
    expect(result.items[0]).toMatchObject({ tid: 'MIC001', subject: 'Q2财务报表 - 紧急审批（多投信）' });
    expect(result.items[1]).toMatchObject({ tid: 'MIC053', subject: '季度营销报告 - 部分收件人白名单（混合处置演示）' });
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

  it('matches display-level action filters against any recipient action in mixed rows', () => {
    const advanced = encodeURIComponent(JSON.stringify({
      operator: 'AND',
      groups: [
        {
          operator: 'AND',
          conditions: [{ field: 'action', op: 'in', value: ['deliver', 'quarantine'] }],
        },
      ],
    }));
    const result = mockEmailDisposalList(`/mail-logs?page=1&page_size=100&advanced_filters=${advanced}`);
    expect(result.items.some((item) => item.tid === 'MIC053' && item.action === 'mixed')).toBe(true);
  });

  it('splits partial delivery into the existing success/failure statuses for display and both filter paths', () => {
    const all = mockEmailDisposalList('/mail-logs?page=1&page_size=100');
    const partial = all.items.find((item) => item.tid === 'MIC015');
    expect(partial?.display_statuses).toEqual([
      { status: 'delivered', count: 5 },
      { status: 'delivery_failed', count: 1 },
    ]);

    for (const status of ['delivered', 'delivery_failed']) {
      const quick = mockEmailDisposalList(
        `/mail-logs?page=1&page_size=100&display_status=${status}`,
      );
      expect(quick.items.some((item) => item.tid === 'MIC015')).toBe(true);

      const advanced = encodeURIComponent(JSON.stringify({
        operator: 'AND',
        groups: [{
          operator: 'AND',
          conditions: [{ field: 'display_status', op: 'in', value: [status] }],
        }],
      }));
      const advancedResult = mockEmailDisposalList(
        `/mail-logs?page=1&page_size=100&advanced_filters=${advanced}`,
      );
      expect(advancedResult.items.some((item) => item.tid === 'MIC015')).toBe(true);
    }
  });

  it('keeps released mixed rows in per-recipient mode', () => {
    const mixed = mockEmailDisposalList('/mail-logs?page=1&page_size=100').items
      .find((item) => item.tid === 'MIC053');
    expect(mixed?.display_statuses).toEqual([
      { status: 'quarantine_pending', count: 1 },
      { status: 'sideline_pending', count: 1 },
      { status: 'delivered', count: 6 },
    ]);
    expect(mixed?.recipient_dispositions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ final_action: 'sideline', status: 'sidelined' }),
      ]),
    );
  });

  it('returns lightweight list groups, keeps full modules in detail, and filters every hit rule', () => {
    const listItem = mockEmailDisposalList('/mail-logs?page=1&page_size=100').items
      .find((item) => item.tid === 'MIC053');
    expect(listItem?.disposal_basis?.modules).toBeUndefined();
    expect(listItem?.disposal_basis_groups?.map((group) => group.policy_key)).toEqual([
      'SBL', 'CR', 'SIM',
    ]);
    expect(listItem?.disposal_basis_groups?.find((group) => group.policy_key === 'SBL'))
      .toMatchObject({ recipient_count: 4, effective_count: 4, effective_known: true });

    const detail = mockEmailDisposalDetail(listItem!.id);
    expect(detail?.disposal_basis?.modules?.length).toBeGreaterThan(1);
    expect(detail?.disposal_basis?.modules?.some((module) => module.recipients?.includes('alice@company.com')))
      .toBe(true);

    const policyResult = mockEmailDisposalList(
      '/mail-logs?page=1&page_size=100&disposal_policy_keys=SIM',
    );
    expect(policyResult.items.some((item) => item.tid === 'MIC053')).toBe(true);

    const advanced = encodeURIComponent(JSON.stringify({
      operator: 'AND',
      groups: [{
        operator: 'AND',
        conditions: [{ field: 'disposal_rule_id', op: 'eq', value: 'SIM-077' }],
      }],
    }));
    const ruleResult = mockEmailDisposalList(
      `/mail-logs?page=1&page_size=100&advanced_filters=${advanced}`,
    );
    expect(ruleResult.items.some((item) => item.tid === 'MIC053')).toBe(true);
  });

  it('searches disposal rule options globally instead of using the current mail page', () => {
    const secondPage = mockEmailDisposalList('/mail-logs?page=2&page_size=1');
    expect(secondPage.items).toHaveLength(1);

    const allOptions = mockEmailDisposalRuleOptions('/mail-logs/_meta/disposal-rules?limit=50');
    expect(allOptions.items.length).toBeGreaterThan(1);
    const target = allOptions.items.at(-1)!;
    const searched = mockEmailDisposalRuleOptions(
      `/mail-logs/_meta/disposal-rules?limit=12&search=${encodeURIComponent(target.id)}`,
    );
    expect(searched.items).toEqual([target]);
  });

  it('provides stable detail, preview, and event endpoints', () => {
    expect(mockEmailDisposalDetail(1)?.recipient_dispositions).toHaveLength(5);
    expect(mockEmailDisposalPreview(1)?.headers['X-Mock-TID']).toBe('MIC001');
    // 4 个通用事件（connected/message_received/policy_decided/最终状态）+ 5
    // 个逐收件人投递事件（Task 12 item 7）+ 4 个投递后处置事件（workflow 族：
    // 隔离放行 / 审核通过 / 审核驳回 / 退信，与后端真实产出的形态一致）。
    expect(mockEmailDisposalEvents(1)).toMatchObject({ total: 13, page_size: 100 });
  });

  it('creates semantic content rules for visible entities and handles retries idempotently', () => {
    const domain = mockEmailDisposalBlacklistEntity(1, {
      kind: 'domain',
      value: 'evil.com',
    });
    expect(domain.status).toBe(201);
    expect(domain.data).toMatchObject({
      page: 'content_rules',
      stage: 'data',
      action: 'quarantine',
      is_active: true,
    });
    if (!('metadata' in domain.data)) throw new Error('expected a content rule');
    expect(JSON.parse(domain.data.metadata ?? '{}')).toMatchObject({
      source: 'email_disposal_center',
      source_mail_log_id: 1,
      entity_kind: 'domain',
      match_content: 'evil.com',
      scopes: ['urls'],
      directions: { receive: { enabled: true, action: 'quarantine' } },
    });
    expect(JSON.parse(domain.data.condition_tree)).toMatchObject({
      type: 'AND',
      children: expect.arrayContaining([
        expect.objectContaining({ field: 'url_entities', operator: 'url_domain', value: 'evil.com' }),
      ]),
    });

    const retry = mockEmailDisposalBlacklistEntity(1, {
      kind: 'domain',
      value: 'evil.com',
    });
    expect(retry.status).toBe(200);
    expect('id' in retry.data && retry.data.id).toBe(domain.data.id);

    const md5 = mockEmailDisposalDetail(1)?.attachments?.[0]?.md5sum;
    const attachment = mockEmailDisposalBlacklistEntity(1, {
      kind: 'attachment_hash',
      value: md5,
    });
    expect(attachment.status).toBe(201);
    expect(attachment.data).toMatchObject({ stage: 'sideline', action: 'quarantine' });
    if (!('condition_tree' in attachment.data)) throw new Error('expected a content rule');
    expect(JSON.parse(attachment.data.condition_tree)).toMatchObject({
      children: expect.arrayContaining([
        expect.objectContaining({ field: 'attachment_md5', operator: 'csv_has', value: md5 }),
      ]),
    });
  });

  it('rejects entities that are not present in the source mail', () => {
    expect(mockEmailDisposalBlacklistEntity(1, {
      kind: 'domain',
      value: 'evil.com.attacker.test',
    }).status).toBe(400);
    expect(mockEmailDisposalBlacklistEntity(1, {
      kind: 'attachment_hash',
      value: 'ffffffffffffffffffffffffffffffff',
    }).status).toBe(400);
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

  it('bulk release updates only actionable recipient objects and preserves terminal recipients', () => {
    const before = mockEmailDisposalDetail(2);
    expect(before?.tid).toBe('MIC053');
    expect(before?.recipient_dispositions?.filter((d) => d.status === 'delivered')).toHaveLength(6);

    const result = mockEmailDisposalMutate(
      { mail_log_ids: [2], action: 'release' },
      'bulk',
    ) as {
      succeeded: number[];
      partial: number[];
      recipient_results: { status: string; reason?: string; recipients: string[] }[];
    };

    expect(result.succeeded).toEqual([2]);
    expect(result.partial).toEqual([]);
    expect(result.recipient_results.filter((entry) => entry.status === 'succeeded')).toHaveLength(2);
    expect(result.recipient_results.filter((entry) => entry.status === 'skipped')).toHaveLength(6);
    expect(
      result.recipient_results
        .filter((entry) => entry.status === 'skipped')
        .every((entry) => entry.reason === 'not_actionable'),
    ).toBe(true);

    const after = mockEmailDisposalDetail(2);
    expect(after?.action).toBe('accept');
    expect(after?.disposition_actions).toEqual(['accept']);
    expect(after?.recipient_dispositions?.filter((d) => d.status === 'delivered')).toHaveLength(6);
    // A successful release only means the message was handed back to the
    // delivery path. The delivery fact has not arrived yet, so backend parity
    // requires "delivering", not an optimistic "delivered".
    expect(after?.recipient_dispositions?.filter((d) => d.status === 'delivering')).toHaveLength(2);
    expect(after?.display_statuses).toEqual([
      { status: 'delivering', count: 2 },
      { status: 'delivered', count: 6 },
    ]);
  });

  it('recognizes only the four backend recall states as active', () => {
    for (const value of [
      'recall_pending',
      'recall_success',
      'recall_failed',
      'partial_recall_success',
    ]) {
      expect(isMockActiveRecallState(value)).toBe(true);
    }
    for (const value of [undefined, null, '', 'none', 'expanded', 'unknown']) {
      expect(isMockActiveRecallState(value)).toBe(false);
    }
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
