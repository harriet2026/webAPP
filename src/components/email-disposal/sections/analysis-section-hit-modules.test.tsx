import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextIntlClientProvider } from 'next-intl';
import zh from '@/../messages/zh.json';
import type { MailLogDetail } from '@/types/email-disposal-detail';
import { AnalysisSection } from './analysis-section';

// GT-12727：命中模块清单（spec §7.10）的渲染守卫。
// 重点是 §7.13 明列却一直没有测试的「租户可见性」那一条，以及三态 effective_for。

const wrap = (ui: React.ReactNode) => (
  <NextIntlClientProvider locale="zh" messages={zh as never}>
    {ui}
  </NextIntlClientProvider>
);

vi.mock('@/i18n/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }),
  Link: ({ children }: { children: React.ReactNode }) => children,
}));

// 视角/形态由本文件控制：租户视角 + 多租户形态才触发平台策略模糊化。
const productForm = { viewer: 'platform' as 'platform' | 'tenant', multiTenant: true };
vi.mock('@/contexts/product-form-context', () => ({
  useProductForm: () => ({
    viewer: productForm.viewer,
    capabilities: { ai: true, multiTenant: productForm.multiTenant, saas: false },
    registry: [],
    grants: [],
    form: 'ai-multi',
  }),
}));

// 后端真实写出的形状：*[]string + omitempty ⟹ 三态编码为
// 「字段缺席 / [] / [...]」。这里刻意用 JSON.parse 而不是手写对象字面量 ——
// 上一轮缺陷（omitempty 让 `[]` 在序列化时蒸发）之所以被两边测试同时漏掉，
// 就是因为 TS 侧手写 `effective_for: []` 从不经过序列化边界。
// 与 Go 侧 TestEffectiveForTriStateSurvivesJSON 钉的字节形状一致。
const SERIALIZED_BASIS = `{
  "policy_key": "IPBL",
  "rule_name": "IP黑名单A",
  "rule_id": "IPBL-11",
  "action": "reject",
  "hit_values": {"source_ip": "203.0.113.5", "entry": "203.0.113.0/24", "list_type": "black"},
  "modules": [
    {"policy_key":"IPBL","rule_name":"IP黑名单A","rule_id":"IPBL-11","action":"reject",
     "hit_values":{"source_ip":"203.0.113.5","entry":"203.0.113.0/24","list_type":"black"},
     "recipients":["a@x.com","b@x.com"],"effective_for":["a@x.com"]},
    {"policy_key":"CR","rule_name":"内容规则A","rule_id":"CR-66","action":"quarantine",
     "hit_values":{"match_method":"regex","match_content":"发票","match_position":"subject","matched_content":"发票代开"},
     "recipients":["b@x.com"],"effective_for":[]},
    {"policy_key":"IPFREQ","rule_name":"连接频率","action":"reject",
     "hit_values":{"count":"500","limit":"100"}}
  ]
}`;

function detailWithModules(): MailLogDetail {
  return {
    id: 1,
    message_id: '<abc@x>',
    message_uuid: 'uuid-1',
    client_ip: '203.0.113.5',
    sender: 'bad@evil.com',
    recipients: ['a@x.com', 'b@x.com'],
    authenticated: false,
    subject: '发票',
    action: 'reject',
    status: 'rejected',
    received_at: '2026-08-04T09:15:00.000Z',
    disposal_basis: JSON.parse(SERIALIZED_BASIS),
  } as MailLogDetail;
}

beforeEach(() => {
  productForm.viewer = 'platform';
  productForm.multiTenant = true;
});

describe('命中模块清单（GT-12727 §7.10）', () => {
  it('渲染每条命中模块，并逐条标注生效 / 仅命中', () => {
    render(wrap(<AnalysisSection detail={detailWithModules()} aiEnabled events={[]} />));
    const items = screen.getAllByTestId('analysis-hit-module-item');
    expect(items).toHaveLength(3);

    // IPBL：部分生效 —— 必须同时出现"生效：a"和"仅命中：b"，
    // 只打一个二元徽标会让管理员把两个收件人都理解成生效（§7.10.2）。
    expect(items[0].textContent).toContain('生效：a@x.com');
    expect(items[0].textContent).toContain('仅命中：b@x.com');

    // CR：effective_for 为 []（确知未生效）⟹ 只有"仅命中"，没有"生效"。
    expect(items[1].textContent).toContain('仅命中：b@x.com');
    expect(items[1].textContent).not.toContain('生效：b@x.com');
    // 命中详情（§7.1 的原始诉求）必须真的渲染出来。
    expect(items[1].textContent).toContain('发票代开');

    // IPFREQ：字段缺席（无归属信息）⟹ 一个归属标注都不打。
    expect(items[2].textContent).not.toContain('生效');
    expect(items[2].textContent).not.toContain('仅命中');
  });

  it('未映射页条目的命中详情不得渲染成横杠占位（Important-3：会话级信号逐条带上）', () => {
    render(wrap(<AnalysisSection detail={detailWithModules()} aiEnabled events={[]} />));
    const items = screen.getAllByTestId('analysis-hit-module-item');
    // IPBL 的命中详情模板读 source_ip；缺字段时 val() 会吐字面量 '-'。
    expect(items[0].textContent).toContain('203.0.113.5');
    expect(items[0].textContent).not.toContain('IP - ');
  });

  it('平台视角下阶段 1 模块名/规则名/命中详情/色点全部可见', () => {
    render(wrap(<AnalysisSection detail={detailWithModules()} aiEnabled events={[]} />));
    const items = screen.getAllByTestId('analysis-hit-module-item');
    expect(items[0].textContent).toContain('IP黑白名单');
    expect(items[0].textContent).toContain('IPBL-11');
    expect(screen.getAllByTestId('analysis-hit-module-stage-dot').length).toBe(3);
  });

  // §7.13「租户可见性（修 MF-10）」—— 清单块必须**逐条**套用可见性门。
  // 整卡片级的 isPlatformPolicyContext 只看主基据，主基据是阶段 3 内容规则时，
  // 清单里的阶段 1 平台策略（IPBL/RBL/OVERSEAS）会连同 source_ip 一起暴露。
  it('租户视角下阶段 1 条目的模块名/规则名/命中详情/色点全部被遮蔽，阶段 3 条目不受影响', () => {
    productForm.viewer = 'tenant';
    render(wrap(<AnalysisSection detail={detailWithModules()} aiEnabled events={[]} />));
    const items = screen.getAllByTestId('analysis-hit-module-item');

    // 阶段 1（IPBL / IPFREQ 都是 stage 1）：模块名、规则名、命中详情均遮蔽。
    for (const idx of [0, 2]) {
      expect(items[idx].textContent).toContain('平台管控策略');
      expect(items[idx].textContent).toContain('平台统一管控');
      expect(items[idx].textContent).not.toContain('IPBL-11');
      expect(items[idx].textContent).not.toContain('IP黑白名单');
      // 命中详情含 source_ip —— 泄露它就是权限回退。
      expect(items[idx].textContent).not.toContain('203.0.113.5');
    }
    // 阶段色点本身泄露"这是阶段 1 策略"，只剩阶段 3 的那一个。
    expect(screen.getAllByTestId('analysis-hit-module-stage-dot').length).toBe(1);

    // 阶段 3 内容规则不属于平台策略，照常展示。
    expect(items[1].textContent).toContain('内容规则');
    expect(items[1].textContent).toContain('CR-66');
    expect(items[1].textContent).toContain('发票代开');
  });

  it('单租户形态（非多租户）不模糊化', () => {
    productForm.viewer = 'tenant';
    productForm.multiTenant = false;
    render(wrap(<AnalysisSection detail={detailWithModules()} aiEnabled events={[]} />));
    const items = screen.getAllByTestId('analysis-hit-module-item');
    expect(items[0].textContent).toContain('IPBL-11');
    expect(items[0].textContent).not.toContain('平台管控策略');
  });

  it('无 modules 也无 per_recipient 时不渲染清单块', () => {
    const detail = detailWithModules();
    detail.disposal_basis = { policy_key: 'CR', rule_name: 'x', action: 'quarantine' };
    render(wrap(<AnalysisSection detail={detail} aiEnabled events={[]} />));
    expect(screen.queryByTestId('analysis-hit-modules')).not.toBeInTheDocument();
  });

  // §7.10.3 老数据回落：per_recipient 全是各收件人的胜出者且**没有** effective_for，
  // 按 [] 处理会把每条都标成"命中但未生效"。
  it('老格式回落：去重且一个归属标注都不打', () => {
    const detail = detailWithModules();
    detail.disposal_basis = JSON.parse(`{
      "policy_key": "CR",
      "per_recipient": [
        {"policy_key":"CR","rule_name":"内容规则A","rule_id":"CR-66","action":"quarantine"},
        {"policy_key":"CR","rule_name":"内容规则A","rule_id":"CR-66","action":"quarantine"},
        {"policy_key":"SBL","rule_name":"发件人黑名单","rule_id":"SBL-9","action":"reject"}
      ]
    }`);
    render(wrap(<AnalysisSection detail={detail} aiEnabled events={[]} />));
    const items = screen.getAllByTestId('analysis-hit-module-item');
    expect(items).toHaveLength(2);
    expect(screen.queryByTestId('analysis-hit-module-attribution')).not.toBeInTheDocument();
  });
});
