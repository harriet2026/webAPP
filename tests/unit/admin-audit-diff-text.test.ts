import { describe, it, expect } from 'vitest';
import { diffText, summaryText } from '@/lib/admin-audit';

describe('admin-audit drawer degrade helpers', () => {
  it('diffText: mock {text} → 原文', () => {
    expect(diffText({ text: 'active' })).toBe('active');
  });
  it('diffText: 真实对象 → key: value 多行', () => {
    expect(diffText({ status: 'active', quota: 200 })).toBe('status: active\nquota: 200');
  });
  it('diffText: 嵌套对象值 → JSON', () => {
    expect(diffText({ cfg: { a: 1 } })).toBe('cfg: {"a":1}');
  });
  it('diffText: 空 → —', () => {
    expect(diffText(undefined)).toBe('—');
    expect(diffText({})).toBe('—');
  });
  it('summaryText: mock details.summary 优先', () => {
    expect(summaryText({ details: { summary: '因欠费暂停租户' } })).toBe('因欠费暂停租户');
  });
  it('summaryText: 无 summary → preview 兜底', () => {
    expect(summaryText({ details: { method: 'POST', path: '/x' } })).toBe('POST | /x');
  });
  it('summaryText: 无 details → —', () => {
    expect(summaryText({ details: undefined })).toBe('—');
  });
});
