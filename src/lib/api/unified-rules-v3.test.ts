import { describe, it, expect, vi } from 'vitest';
import { getFieldDefinitions } from './unified-rules';

describe('getFieldDefinitions page scoping', () => {
  it('passes the page query when provided', async () => {
    const fn = vi.fn().mockResolvedValue({ fields: {} });
    await getFieldDefinitions('data', 'advanced_rules', fn);
    expect(fn).toHaveBeenCalledWith(
      expect.stringContaining('page=advanced_rules'),
    );
    expect(fn).toHaveBeenCalledWith(expect.stringContaining('stage=data'));
  });

  it('传 ruleClass 时带上 rule_class 查询参数（GT-12780：route 语境下目录要按写侧白名单收敛）', async () => {
    const fn = vi.fn().mockResolvedValue({ fields: {} });
    await getFieldDefinitions('data', 'mail_routing_outbound', fn, 'route');
    expect(fn).toHaveBeenCalledWith(expect.stringContaining('rule_class=route'));
  });

  it('不传 ruleClass 时不带该参数（既有调用方行为不变）', async () => {
    const fn = vi.fn().mockResolvedValue({ fields: {} });
    await getFieldDefinitions('data', 'advanced_rules', fn);
    expect(fn).not.toHaveBeenCalledWith(expect.stringContaining('rule_class'));
  });
});
