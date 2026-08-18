import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import zh from '../../messages/zh.json';

// GT-12237: 邮件状态筛选标签必须与 design/origin/spec/V2邮件状态机字典.md
// 的状态机定义一致（rejected=拒收、delivery_failed=投递失败、sideline_pending=检测中、
// audit_pending=待审核）。此前 UI 显示 已拒绝/退信/待审核/待审批，把旁路检测
// 与人工审核语义混淆。
describe('GT-12237 emailDisposal.filters.statuses 对齐 V2 状态机字典', () => {
  const statuses = zh.emailDisposal.filters.statuses as Record<string, string>;

  it('rejected 显示为「拒收」', () => {
    expect(statuses.rejected).toBe('拒收');
  });

  it('GT-12955 将退信归并为「投递失败」', () => {
    expect(statuses.delivery_failed).toBe('投递失败');
    expect(statuses.bounced).toBeUndefined();
  });

  it('sideline_pending 显示为「检测中」（旁路深度分析，非人工审核）', () => {
    expect(statuses.sideline_pending).toBe('检测中');
  });

  it('audit_pending 显示为「待审核」（外发人工审批）', () => {
    expect(statuses.audit_pending).toBe('待审核');
  });
});

// GT-12238: 邮件类型筛选标签必须使用原型全称
// （webapp/doc/html-spec/email-handling-disposal-center/
// layer-1-search-mailtype-popover.html），不能使用缩写。
describe('GT-12238 emailDisposal.filters.mailTypes 使用原型全称', () => {
  const mailTypes = zh.emailDisposal.filters.mailTypes as Record<string, string>;

  const expected: Record<string, string> = {
    subscription: '订阅资讯',
    advertising: '广告邮件',
    harmful: '有害内容邮件',
    suspicious: '可疑邮件',
    sensitive: '敏感内容邮件',
    spoofing: '仿冒邮件',
    phishing: '钓鱼邮件',
    virus: '病毒邮件',
  };

  for (const [key, label] of Object.entries(expected)) {
    it(`${key} 显示为「${label}」`, () => {
      expect(mailTypes[key]).toBe(label);
    });
  }
});

// GT-12238 补充：八个邮件类型必须同时出现在快捷筛选（quick-filters）与
// 表头筛选（mail-list-table emailTypeOptions）的枚举中，且引用同一
// emailDisposal.filters.mailTypes 文案，防止某条路径漏类别或退回缩写。
describe('GT-12238 邮件类型筛选枚举包含八个类别', () => {
  const eight = ['subscription', 'advertising', 'harmful', 'suspicious', 'sensitive', 'spoofing', 'phishing', 'virus'];

  it('quick-filters mailTypes 枚举含八个类别', () => {
    const src = readFileSync(
      resolve(__dirname, '../../src/components/email-disposal/quick-filters.tsx'),
      'utf-8',
    );
    const m = src.match(/const mailTypes = \[([\s\S]*?)\] as const/);
    expect(m, '未找到 quick-filters mailTypes 枚举').toBeTruthy();
    for (const k of eight) expect(m![1]).toContain(`"${k}"`);
  });

  it('mail-list-table emailTypeOptions 枚举含八个类别', () => {
    const src = readFileSync(
      resolve(__dirname, '../../src/components/email-disposal/mail-list-table.tsx'),
      'utf-8',
    );
    const m = src.match(/emailTypeOptions = \[([\s\S]*?)\]/);
    expect(m, '未找到 emailTypeOptions 枚举').toBeTruthy();
    for (const k of eight) expect(m![1]).toContain(`'${k}'`);
  });
});

// GT-12237 补充：QC 报告"筛选项中没有检测中"。快捷筛选（quick-filters.tsx）
// 与表头筛选共用 DISPLAY_STATUSES，防止局部数组漂移。
describe('GT-12237 状态筛选枚举包含 sideline_pending（检测中）', () => {
  it('quick-filters 复用权威枚举', () => {
    const src = readFileSync(
      resolve(__dirname, '../../src/components/email-disposal/quick-filters.tsx'),
      'utf-8',
    );
    expect(src).toContain('const statuses = DISPLAY_STATUSES');
  });

  it('mail-list-table 表头筛选复用权威枚举', () => {
    const src = readFileSync(
      resolve(__dirname, '../../src/components/email-disposal/mail-list-table.tsx'),
      'utf-8',
    );
    expect(src).toContain('const statusOptions = DISPLAY_STATUSES');
  });
});
