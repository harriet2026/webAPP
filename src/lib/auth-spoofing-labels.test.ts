import { describe, it, expect } from 'vitest';
import { formatActionKey, protocolActionKey, flowSubKey } from './auth-spoofing-labels';
import zh from '../../messages/zh.json';
import en from '../../messages/en.json';
import ru from '../../messages/ru.json';
import th from '../../messages/th.json';

const LOCALES = { zh, en, ru, th } as Record<string, any>;

describe('auth-spoofing protocol action labels (GT-12650)', () => {
  // `protocolActionLabel.*`是协议检查下拉框的文案，`action.*`是同一 namespace 里
  // 该动作的规范名。两者描述的是**同一个后端动作字符串**，所以
  // 下拉文案必须以规范名开头，只允许追加括号补充说明。
  //
  // 这条不变量正是 GT-12650 的红灯：audit 的后端语义是「扣住邮件进审核队列等审批」
  // (internal/antispam/milter.go handleInboundAudit/handleOutboundAudit,
  //  actionWithholdsDelivery 把 audit 与 quarantine/reject 并列)，
  // 而文案曾写成「标记（加头投递）」——一个后端根本不存在的动作。
  // 注意：这条锚定只对 zh 成立。en/ru/th 的译者在两组里用了同义词
  // (如 th reject: action="ปฏิเสธ" / protocolActionLabel="บล็อก")，
  // 所以不能把「以规范名开头」当成全语种不变量——那会红在与本工单无关的既有译文上。
  const ANCHORED: Array<'quarantine' | 'reject' | 'audit' | 'discard'> = [
    'quarantine',
    'reject',
    'audit',
    'discard',
  ];

  it('zh: protocolActionLabel 以 action 规范名开头，括号内只作补充说明', () => {
    const ns = zh.authSpoofing;
    for (const a of ANCHORED) {
      const canonical: string = (ns.action as any)[a];
      const label: string = (ns.protocolActionLabel as any)[a];
      expect(canonical, `action.${a} 缺失`).toBeTruthy();
      expect(label, `protocolActionLabel.${a} 缺失`).toBeTruthy();
      expect(
        label.startsWith(canonical),
        `protocolActionLabel.${a}="${label}" 与规范名 "${canonical}" 不符`,
      ).toBe(true);
    }
  });

  for (const [locale, msgs] of Object.entries(LOCALES)) {
    it(`${locale}: audit 下拉文案须含该语种的 audit 规范名`, () => {
      const ns = msgs.authSpoofing;
      const canonical: string = ns.action.audit;
      const label: string = ns.protocolActionLabel.audit;
      expect(canonical, `${locale} action.audit 缺失`).toBeTruthy();
      expect(label, `${locale} protocolActionLabel.audit 缺失`).toBeTruthy();
      expect(
        label.includes(canonical),
        `${locale} protocolActionLabel.audit="${label}" 未含规范名 "${canonical}"`,
      ).toBe(true);
    });
  }

  it('audit 文案不得描述「加头投递」——后端 audit 会扣住邮件，不投递', () => {
    // 直接把缺陷文案钉死：后端 audit 路径不加任何 header,也不投递。
    expect(zh.authSpoofing.protocolActionLabel.audit).not.toMatch(/标记|加头|投递/);
    expect(en.authSpoofing.protocolActionLabel.audit).not.toMatch(/tag|header/i);
    expect(ru.authSpoofing.protocolActionLabel.audit).not.toMatch(/Пометить|заголов/i);
    expect(th.authSpoofing.protocolActionLabel.audit).not.toMatch(/ทำเครื่องหมาย|ส่วนหัว/);
  });
});

describe('auth-spoofing label mapping', () => {
  // Keys are relative to the `authSpoofing` namespace (resolved via
  // useTranslations('authSpoofing')) — no leading `authSpoofing.` prefix.
  it('flow sub: discard->drop, reject->block, else quarantine; ptr non-discard->check', () => {
    expect(flowSubKey('discard', false)).toBe('flowSub.drop');
    expect(flowSubKey('reject', false)).toBe('flowSub.block');
    expect(flowSubKey('quarantine', false)).toBe('flowSub.quarantine');
    expect(flowSubKey('quarantine', true)).toBe('flowSub.check');
    expect(flowSubKey('discard', true)).toBe('flowSub.drop');
  });
  it('context keys', () => {
    expect(formatActionKey('proceed')).toBe('formatActionLabel.proceed');
    expect(protocolActionKey('audit')).toBe('protocolActionLabel.audit');
  });
});
