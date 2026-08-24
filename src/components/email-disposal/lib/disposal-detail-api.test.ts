import { describe, expect, test, vi } from 'vitest';
import {
  blacklistMailLogEntity,
  disposeByObject,
  getMailLogAnalysis,
  legacyLifecycleStreamEvents,
} from './disposal-detail-api';
import type { ApiRequestFn } from '@/lib/api/client';

describe('getMailLogAnalysis', () => {
  test('encodes the selected recipient and normalizes snake_case stage fields', async () => {
    const requestFn = vi.fn().mockResolvedValue({
      scope: 'recipient',
      recipient: 'A+B@example.test',
      action: 'quarantine',
      status: 'quarantined',
      final_verdict: 'malicious',
      total_elapsed_ms: 42,
      stages: [
        {
          stage: 3,
          key: 'content',
          status: 'threat',
          duration_ms: 17,
          checks: [{
            key: 'contentRules',
            status: 'threat',
            rule_ids: [7, 9],
            recipient_groups: [
              { recipients: ['A+B@example.test'], status: 'threat', rule_ids: [7, 9] },
              { recipients: ['clean@example.test'], status: 'pass', rule_ids: [] },
            ],
          }],
        },
      ],
    }) as unknown as ApiRequestFn;

    const result = await getMailLogAnalysis(42, 'A+B@example.test', requestFn);

    expect(requestFn).toHaveBeenCalledWith('/mail-logs/42/analysis?recipient=A%2BB%40example.test');
    expect(result.stages[0]).toMatchObject({ durationMs: 17 });
    expect(result.stages[0].checks[0]).toMatchObject({ ruleIds: [7, 9] });
    expect(result.stages[0].checks[0].recipientGroups).toEqual([
      { recipients: ['A+B@example.test'], status: 'threat', ruleIds: [7, 9] },
      { recipients: ['clean@example.test'], status: 'pass', ruleIds: [] },
    ]);
  });
});

describe('disposeByObject', () => {
  test('omits final_type from the request body when undefined', async () => {
    const requestFn = vi.fn().mockResolvedValue({ results: [] }) as unknown as ApiRequestFn;
    await disposeByObject(42, 'obj-1', 'delete', undefined, requestFn);

    expect(requestFn).toHaveBeenCalledTimes(1);
    const [, opts] = (requestFn as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(opts.body).toEqual({ action: 'delete', mail_log_ids: [42], object_id: 'obj-1' });
    expect(opts.body).not.toHaveProperty('final_type');
  });

  test('includes final_type in the request body when set', async () => {
    const requestFn = vi.fn().mockResolvedValue({ results: [] }) as unknown as ApiRequestFn;
    await disposeByObject(42, 'obj-1', 'release', 'normal', requestFn);

    const [, opts] = (requestFn as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(opts.body).toEqual({ action: 'release', mail_log_ids: [42], object_id: 'obj-1', final_type: 'normal' });
  });
});

describe('legacyLifecycleStreamEvents', () => {
  test('keeps a successful node/module result when a sibling node failed', () => {
    const events = legacyLifecycleStreamEvents({
      items: [{
        event_uid: 'event-a',
        message_uuid: '2540e741-0b50-4cf7-bbab-dc241df4e082',
        node: 'node-a',
        component: 'antispam',
        event_time: '2026-08-19T08:00:00Z',
        raw_line: 'kept',
      }],
      total: 1,
      truncated: false,
      partial: true,
      searched_nodes: ['node-a', 'node-b'],
      failed_nodes: ['node-b'],
    });

    expect(events).toContainEqual(expect.objectContaining({
      event: 'module_done',
      data: expect.objectContaining({ node: 'node-a', module: 'antispam' }),
    }));
    expect(events).toContainEqual(expect.objectContaining({
      event: 'node_failed',
      data: expect.objectContaining({ node: 'node-b' }),
    }));
    expect(events.at(-1)).toEqual(expect.objectContaining({
      event: 'done', data: expect.objectContaining({ partial: true }),
    }));
  });
});

describe('blacklistMailLogEntity', () => {
  test('sends only mail id, entity kind and value to the semantic backend action', async () => {
    const requestFn = vi.fn().mockResolvedValue({}) as unknown as ApiRequestFn;
    await blacklistMailLogEntity(42, 'domain', 'evil.com', requestFn);

    expect(requestFn).toHaveBeenCalledTimes(1);
    const [url, opts] = (requestFn as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(url).toBe('/mail-logs/42/blacklist');
    expect(opts.method).toBe('POST');
    expect(opts.body).toEqual({ kind: 'domain', value: 'evil.com' });
    expect(opts.body).not.toHaveProperty('priority');
    expect(opts.body).not.toHaveProperty('condition_tree');
  });

  test('preserves a full URL as the action value', async () => {
    const requestFn = vi.fn().mockResolvedValue({}) as unknown as ApiRequestFn;
    await blacklistMailLogEntity(7, 'url', 'https://evil.com/phish', requestFn);

    const [, opts] = (requestFn as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(opts.body).toEqual({ kind: 'url', value: 'https://evil.com/phish' });
  });

  test('uses the attachment_hash kind for an MD5 entity', async () => {
    const requestFn = vi.fn().mockResolvedValue({}) as unknown as ApiRequestFn;
    const md5 = 'deadbeefdeadbeefdeadbeefdeadbeef';
    await blacklistMailLogEntity(9, 'attachment_hash', md5, requestFn);

    const [, opts] = (requestFn as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(opts.body).toEqual({ kind: 'attachment_hash', value: md5 });
  });
});
