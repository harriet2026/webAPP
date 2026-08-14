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
  it('provides the exact 55-row demo dataset and 30 advanced fields', () => {
    // GT-12649: +2 阶段1（IPBL/RBL 平台策略）示例行 MIC026/MIC027；
    // demo 合入: +25 跨页选中/全量导出验证行（顺延编号 MIC028-MIC052）。
    // +MIC053 混合处置（mixed）演示行。
    // 群发邮件日志数据补充: +2 群发邮件行（MIC054/MIC055），均为单封邮件内
    // 不同收件人邮件状态各不相同的 mixed 记录。紧跟在 MIC001 之后插入（索引
    // 1/2），使其在默认（未排序）视图下排在日志列表最开始的几条；MIC053 随之
    // 后移一位到索引 3。
    const result = mockEmailDisposalList('/mail-logs?page=1&page_size=100');
    expect(result.total).toBe(55);
    expect(result.items).toHaveLength(55);
    expect(result.items[0]).toMatchObject({ tid: 'MIC001', subject: 'Q2财务报表 - 紧急审批（多投信）' });
    expect(result.items[1]).toMatchObject({ tid: 'MIC054', subject: '供应商发票变更通知（多投信 - 混合处置：投递/丢弃/隔离）' });
    expect(result.items[2]).toMatchObject({ tid: 'MIC055', subject: '话费账单通知（多投信 - 混合处置：投递/丢弃/隔离）' });
    expect(result.items[3]).toMatchObject({ tid: 'MIC053', subject: '季度营销报告 - 部分收件人白名单（混合处置演示）' });
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

  // GT-12923 阶段二：`action` 字段的筛选语义修正。
  //   1) 非 mixed 记录：mock 内部历史词表（accept/audit/reject/discard/
  //      quarantine）与筛选值词表（deliver/review/block/drop/quarantine）
  //      不一致，需要先归一化才能匹配——用 'review'/'block' 验证这条链路，
  //      避免既有词表不对齐的回归。
  //   2) mixed 记录（MIC053）：action 恒为 'mixed'，筛选需改为对
  //      disposition_actions 数组做��一化后取交集（OR），而不是要求
  //      item.action 本身精确等于筛选值。
  const advancedFilterFor = (field: string, op: string, value: unknown) =>
    encodeURIComponent(
      JSON.stringify({
        operator: 'AND',
        groups: [{ operator: 'AND', conditions: [{ field, op, value }] }],
      }),
    );

  it('normalizes the legacy raw action vocabulary (audit/reject) to the filter-facing vocabulary (review/block) for non-mixed rows', () => {
    const reviewResult = mockEmailDisposalList(
      `/mail-logs?page=1&page_size=100&advanced_filters=${advancedFilterFor('action', 'eq', 'review')}`,
    );
    expect(reviewResult.total).toBeGreaterThan(0);
    expect(reviewResult.items.every((item) => item.action === 'audit')).toBe(true);

    const blockResult = mockEmailDisposalList(
      `/mail-logs?page=1&page_size=100&advanced_filters=${advancedFilterFor('action', 'eq', 'block')}`,
    );
    expect(blockResult.total).toBeGreaterThan(0);
    expect(blockResult.items.every((item) => item.action === 'reject')).toBe(true);
  });

  it('matches a mixed row (MIC053) by any recipient action via disposition_actions intersection, not the scalar action=mixed field', () => {
    const deliverResult = mockEmailDisposalList(
      `/mail-logs?page=1&page_size=100&advanced_filters=${advancedFilterFor('action', 'in', ['deliver'])}`,
    );
    expect(deliverResult.items.some((item) => item.tid === 'MIC053')).toBe(true);

    const quarantineResult = mockEmailDisposalList(
      `/mail-logs?page=1&page_size=100&advanced_filters=${advancedFilterFor('action', 'in', ['quarantine'])}`,
    );
    expect(quarantineResult.items.some((item) => item.tid === 'MIC053')).toBe(true);

    // MIC053 的 disposition_actions 是 ['accept','quarantine','sideline']（归一
    // 化为 deliver/quarantine/sideline），不包含任何映射到 recall 的原始动
    // 作，因此不应命中 recall 筛选。
    const recallResult = mockEmailDisposalList(
      `/mail-logs?page=1&page_size=100&advanced_filters=${advancedFilterFor('action', 'eq', 'recall')}`,
    );
    expect(recallResult.items.some((item) => item.tid === 'MIC053')).toBe(false);
  });

  // GT-12923 阶段三：`action` 从 advanced_filters 里的条件挪到顶层查询参数
  // action=deliver,quarantine（OR 语义，与 email_type/disposal_policy_keys
  // 的处理方式一致），供 getDisposalList(disposal-api.ts) 的新参数落地对接。
  // 归一化 + mixed 交集的语义与阶段二一致，这里只验证新的参数名路径本身
  // 也接得上，不重复阶段二已经覆盖的归一化细节。
  it('filters by the top-level action query param (not advanced_filters), applying the same normalization + mixed intersection semantics', () => {
    const reviewResult = mockEmailDisposalList(
      '/mail-logs?page=1&page_size=100&action=review',
    );
    expect(reviewResult.total).toBeGreaterThan(0);
    expect(reviewResult.items.every((item) => item.action === 'audit')).toBe(true);

    const multiResult = mockEmailDisposalList(
      '/mail-logs?page=1&page_size=100&action=deliver,quarantine',
    );
    // MIC053 (mixed) 命中：disposition_actions 里含归一化后的 deliver/quarantine。
    expect(multiResult.items.some((item) => item.tid === 'MIC053')).toBe(true);
    // 命中的记录本身要么直接是 accept/quarantine，要么是 mixed 且交集非空。
    expect(
      multiResult.items.every(
        (item) =>
          item.action === 'accept' ||
          item.action === 'quarantine' ||
          (item.action === 'mixed' &&
            (item.disposition_actions ?? []).some((a) =>
              ['accept', 'quarantine'].includes(a),
            )),
      ),
    ).toBe(true);
  });

  // 群发邮件"邮件状态"筛选修复：筛选"投递成功"（display_status=delivered）
  // 需要搜出包含至少一个已投递收件人的群发（mixed）邮件，而不是要求整封
  // 邮件的（恒为 "delivering" 的）汇总状态精确等于 delivered——否则所有
  // mixed 记录在筛"投递成功"时都会被漏掉，即使其中确实有投递成功的收件人。
  it('matches a mixed row by any recipient status via recipient_dispositions intersection (display_status=delivered), not the scalar aggregate status', () => {
    const deliveredResult = mockEmailDisposalList(
      '/mail-logs?page=1&page_size=100&display_status=delivered',
    );
    // MIC053/MIC054/MIC055 均含已投递收件人，应命中"投递成功"筛选。
    expect(deliveredResult.items.some((item) => item.tid === 'MIC053')).toBe(true);
    expect(deliveredResult.items.some((item) => item.tid === 'MIC054')).toBe(true);
    expect(deliveredResult.items.some((item) => item.tid === 'MIC055')).toBe(true);
    // 命中的记录本身要么直接是整体已投递，要么是 mixed 且至少一个收件人已投递。
    expect(
      deliveredResult.items.every(
        (item) =>
          item.action !== 'mixed' ||
          (item.recipient_dispositions ?? []).some((d) => d.status === 'delivered'),
      ),
    ).toBe(true);

    // 筛"隔离中"（quarantine_pending）也应命中含隔离收件人的群发邮件。
    const quarantineResult = mockEmailDisposalList(
      '/mail-logs?page=1&page_size=100&display_status=quarantine_pending',
    );
    expect(quarantineResult.items.some((item) => item.tid === 'MIC054')).toBe(true);
  });

  it('sorts by received time without mutating the canonical fixture order', () => {
    const ascending = mockEmailDisposalList('/mail-logs?page=1&page_size=100&sort_order=asc');
    expect(ascending.items[0].received_at <= ascending.items.at(-1)!.received_at).toBe(true);
    expect(mockEmailDisposalList('/mail-logs?page=1&page_size=1').items[0].tid).toBe('MIC001');
  });
});
