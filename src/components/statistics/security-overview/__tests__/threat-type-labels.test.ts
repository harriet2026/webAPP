import { describe, it, expect } from 'vitest';
import zh from '../../../../../messages/zh.json';
import en from '../../../../../messages/en.json';
import th from '../../../../../messages/th.json';
import ru from '../../../../../messages/ru.json';

// GT-11982 / GT-11933.
//
// Of the four sub-items the tickets raise, only two were actionable:
//   (3) 命名与原型不一致 — the labels were abbreviated (正常 / 垃圾邮件 / 可疑 …)
//   (4) 缺「正常邮件默认隐藏」提示 — the behaviour exists (hiddenSeries starts as
//       new Set(['normal'])) but nothing on the page ever explained WHY normal
//       mail was missing from the chart.
//
// The other two are NOT bugs and must stay unfixed:
//   (1) 「缺少泄密邮件」— A类. 2026-05-26-security-overview-design.md:19 「砍掉
//       威胁类型.泄密，9类→8类｜用户确认」; the gateway has no such concept and the
//       SQL would return a constant 0.
//   (2) 「普通垃圾/可疑垃圾被合并」— factually untrue: spam / suspicious /
//       high_risk_spam have always been three independent series.
const LOCALES = { zh, en, th, ru } as unknown as Record<
  string,
  { securityOverview: { threatTypes: Record<string, string>; normalHiddenHint: string } }
>;

const THREAT_KEYS = [
  'normal',
  'spam',
  'suspicious',
  'high_risk_spam',
  'phishing',
  'virus',
  'malicious',
  'invalid',
];

describe('security-overview threat-type labels (GT-11982 / GT-11933)', () => {
  it('keeps exactly the 8 spec-confirmed types — 泄密 stays out', () => {
    for (const [loc, msgs] of Object.entries(LOCALES)) {
      const keys = Object.keys(msgs.securityOverview.threatTypes);
      expect(keys.sort(), `${loc} threat types`).toEqual([...THREAT_KEYS].sort());
      // spec §10: 不做「泄密邮件」(网关无对应概念) — must never be reintroduced here
      expect(keys, `${loc} must not add 泄密`).not.toContain('leak');
    }
  });

  it('spam / suspicious / high_risk_spam remain three distinct labels (they were never merged)', () => {
    const tt = LOCALES.zh.securityOverview.threatTypes;
    expect(new Set([tt.spam, tt.suspicious, tt.high_risk_spam]).size).toBe(3);
  });

  it('zh labels match the prototype naming, not the abbreviated form', () => {
    const tt = LOCALES.zh.securityOverview.threatTypes;
    expect(tt.normal).toBe('正常邮件'); // was 正常
    expect(tt.spam).toBe('普通垃圾'); // was 垃圾邮件
    expect(tt.suspicious).toBe('可疑垃圾'); // was 可疑
    expect(tt.high_risk_spam).toBe('高风险垃圾'); // was 高风险垃圾邮件
    expect(tt.phishing).toBe('钓鱼邮件'); // was 钓鱼
    expect(tt.virus).toBe('病毒邮件'); // was 病毒
    expect(tt.malicious).toBe('恶意邮件'); // was 恶意
    expect(tt.invalid).toBe('无效邮件'); // was 无效
  });

  it('every locale explains WHY normal mail is hidden by default', () => {
    for (const [loc, msgs] of Object.entries(LOCALES)) {
      const hint = msgs.securityOverview.normalHiddenHint;
      expect(hint, `${loc} normalHiddenHint`).toBeTruthy();
      // must not be a raw key path leaking through
      expect(hint).not.toContain('securityOverview.');
    }
    // zh must actually say it — the shipped trendPeakHint talks about click /
    // double-click interaction, which answers a different question entirely.
    const zhHint = LOCALES.zh.securityOverview.normalHiddenHint;
    expect(zhHint).toContain('正常邮件默认隐藏');
    expect(zhHint).toContain('图例');
  });
});
