import { describe, it, expect, vi } from 'vitest';
import { stage2NavItems } from '@/components/security/PolicyPipelinePage';
import zh from '../../messages/zh.json';

vi.mock('@/i18n/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

// GT-11878: 收信人检测的后端能力（收信人数量限制）完整且在线生效（milter 里
// checkRecipientLimit 在跑），管理入口被合并进「发信行为管控」抽屉。但那次合并
// 只在流水线页执行了 —— email-disposal / group-policy 两处 UI 至今仍把
// recipientCheck 列为阶段2的第5项，形成页面间不一致。补回该卡片作为入口。
describe('policy pipeline stage2 recipientCheck (GT-11878)', () => {
  it('stage2 has 5 sub-policies, including recipientCheck', () => {
    const keys = stage2NavItems.map((i) => i.key);
    expect(keys).toHaveLength(5);
    expect(keys).toContain('recipientCheck');
  });

  it('recipientCheck sits after behaviorControl, per the prototype ordering', () => {
    const keys = stage2NavItems.map((i) => i.key);
    expect(keys.indexOf('recipientCheck')).toBeGreaterThan(keys.indexOf('behaviorControl'));
    expect(keys.indexOf('recipientCheck')).toBeLessThan(keys.indexOf('userList'));
  });

  it('the card summary reflects both implemented capabilities: 数量限制 + 存在性验证', () => {
    // html_spec 落地对齐后，收信人检测在独立的 RecipientCheckPage 里同时提供
    // 「数量限制策略」（端到端接通 milter，含 discard/-1）与「存在性验证策略」
    // （UI + config 存储，config_type=recipient_check）。因此卡片摘要应如实描述
    // 这两块能力，而不再回避存在性验证。
    const desc = (zh as unknown as Record<string, Record<string, string>>).pipeline
      .recipientCheckDesc;
    expect(desc).toBeTruthy();
    expect(desc).toContain('数量限制');
    expect(desc).toContain('存在性验证');
  });
});
