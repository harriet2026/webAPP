import { describe, expect, it } from 'vitest';
import {
  matchBehaviorControlObject,
  simulateBehaviorControl,
} from '@/lib/behavior-control-simulator';

describe('matchBehaviorControlObject', () => {
  it('发件人不匹配个人邮箱通配对象时拒绝继续计算阈值', () => {
    expect(matchBehaviorControlObject({
      objectConfig: { type: 'sender', sub_type: 'individual', value: '*@test.cn' },
      sender: '2@test.no',
      senderIp: '192.168.1.1',
    })).toEqual({ matched: false, reason: 'sender_mismatch' });
  });

  it('发件人匹配个人邮箱通配对象时允许继续计算阈值', () => {
    expect(matchBehaviorControlObject({
      objectConfig: { type: 'sender', sub_type: 'individual', value: '*@test.cn' },
      sender: 'user@Test.CN',
      senderIp: '192.168.1.1',
    })).toEqual({ matched: true });
  });

  it('发件域必须与规则域完整匹配', () => {
    expect(matchBehaviorControlObject({
      objectConfig: { type: 'senderDomain', value: 'test.cn' },
      sender: 'user@not-test.cn',
      senderIp: '192.168.1.1',
    })).toEqual({ matched: false, reason: 'sender_mismatch' });
  });

  it('测试 IP 必须落入规则 CIDR', () => {
    expect(matchBehaviorControlObject({
      objectConfig: { type: 'senderIp', sub_type: 'single', value: '192.168.2.0/24' },
      sender: 'user@test.cn',
      senderIp: '192.168.1.1',
    })).toEqual({ matched: false, reason: 'ip_mismatch' });
  });

  it('发件人组使用真实成员匹配测试发件人', () => {
    expect(matchBehaviorControlObject({
      objectConfig: { type: 'sender', sub_type: 'group', value: 'sales' },
      sender: 'user@test.cn',
      senderIp: '192.168.1.1',
      groupMembers: ['vip@example.cn', 'test.cn'],
    })).toEqual({ matched: true });
  });

  it('IP 组同时支持精确 IP 和 CIDR 成员', () => {
    expect(matchBehaviorControlObject({
      objectConfig: { type: 'senderIp', sub_type: 'ipGroup', value: 'office' },
      sender: 'user@test.cn',
      senderIp: '10.20.30.40',
      groupMembers: ['192.168.1.1', '10.20.0.0/16'],
    })).toEqual({ matched: true });
  });

  it('无法取得组成员时不会伪造匹配结果', () => {
    expect(matchBehaviorControlObject({
      objectConfig: { type: 'sender', sub_type: 'group', value: 'sales' },
      sender: 'user@test.cn',
      senderIp: '192.168.1.1',
      groupMembers: null,
    })).toEqual({ matched: false, reason: 'group_unavailable' });
  });

  it('组织对象无法从本地测试邮箱推断时不会伪造匹配结果', () => {
    expect(matchBehaviorControlObject({
      objectConfig: { type: 'sender', sub_type: 'organization', value: '总部 / 研发部' },
      sender: 'user@test.cn',
      senderIp: '192.168.1.1',
    })).toEqual({ matched: false, reason: 'organization_unavailable' });
  });
});

describe('simulateBehaviorControl', () => {
  it('附件总大小达到 MiB 阈值时命中', () => {
    expect(simulateBehaviorControl({
      conditions: [{ dim: 'attachment_size', threshold: 10 }],
      orEnabled: false,
      inputs: {
        uniqueSenderIPCount: 1,
        mailCount: 1,
        recipientCount: 1,
        attachmentSizeMiB: 10,
      },
    })).toEqual({
      condition: '1', dimension: 'attachment_size', count: 10, threshold: 10,
    });
  });

  it('附件总大小低于 MiB 阈值时不命中', () => {
    expect(simulateBehaviorControl({
      conditions: [{ dim: 'attachment_size', threshold: 10 }],
      orEnabled: false,
      inputs: {
        uniqueSenderIPCount: 1,
        mailCount: 1,
        recipientCount: 1,
        attachmentSizeMiB: 9,
      },
    })).toBeNull();
  });

  it('当唯一发信 IP 数达到 ip_count 阈值时命中', () => {
    expect(simulateBehaviorControl({
      conditions: [{ dim: 'ip_count', threshold: 3 }],
      orEnabled: false,
      inputs: {
        uniqueSenderIPCount: 3, mailCount: 50, recipientCount: 30, attachmentSizeMiB: 10,
      },
    })).toEqual({ condition: '1', dimension: 'ip_count', count: 3, threshold: 3 });
  });

  it('当唯一发信 IP 数低于 ip_count 阈值时不命中', () => {
    expect(simulateBehaviorControl({
      conditions: [{ dim: 'ip_count', threshold: 3 }],
      orEnabled: false,
      inputs: {
        uniqueSenderIPCount: 2, mailCount: 50, recipientCount: 30, attachmentSizeMiB: 10,
      },
    })).toBeNull();
  });

  it('主条件未命中时，使用 ip_count 的 OR 条件仍可命中', () => {
    expect(simulateBehaviorControl({
      conditions: [
        { dim: 'mail_count', threshold: 100 },
        { dim: 'ip_count', threshold: 2 },
      ],
      orEnabled: true,
      inputs: {
        uniqueSenderIPCount: 2, mailCount: 50, recipientCount: 30, attachmentSizeMiB: 10,
      },
    })).toEqual({ condition: '2', dimension: 'ip_count', count: 2, threshold: 2 });
  });
});
