import { describe, it, expect } from 'vitest';
import zh from '@/../messages/zh.json';
import en from '@/../messages/en.json';
import th from '@/../messages/th.json';
import ru from '@/../messages/ru.json';

// GT-12663：domain_imp 的值是**编辑距离**——internal/antispam/precompute.go 的
// `dist := LevenshteinDistance(senderDomain, protected)`，取值 ≥1 的整数、无
// 100 上限、越小越像。而条件面板的说明文案写的是"0-100 的置信度阈值，越高
// 越严格"，量纲和方向都反了。该文案是从 demo 原型整体搬运进来的
// （design/origin 里逐字相同），html-spec 源头也写着"相似域名检测(0-100)"。
//
// 最直接的自相矛盾证据：同一产品的身份认证/仿冒检测页对同一字段给的是
// **1-5 滑块**（internal/api/auth_spoofing.go 的 threshold 校验限定 1-5、
// 默认 2，内置规则是 `domain_imp[*] le 2`）。
//
// 断言写成"不得出现置信度量纲"而不是逐字比对文案，这样文案措辞可以再润色，
// 但一旦有人把 0-100/confidence 写回去就会红。
describe('相似域名条件说明的量纲 (GT-12663)', () => {
  const notes: Record<string, string> = {
    zh: (zh as never as Record<string, never>)['advancedRulesFeature']['v3Conditions']['desc_similarDomain']['note'],
    en: (en as never as Record<string, never>)['advancedRulesFeature']['v3Conditions']['desc_similarDomain']['note'],
    th: (th as never as Record<string, never>)['advancedRulesFeature']['v3Conditions']['desc_similarDomain']['note'],
    ru: (ru as never as Record<string, never>)['advancedRulesFeature']['v3Conditions']['desc_similarDomain']['note'],
  };

  it('四语说明都不得再出现 0-100 置信度量纲', () => {
    for (const [lang, note] of Object.entries(notes)) {
      expect(note, `${lang} note`).toBeTruthy();
      expect(note, `${lang} note 不应含 0-100`).not.toMatch(/0\s*[-–]\s*100/);
      expect(note, `${lang} note 不应提置信度/confidence`).not.toMatch(/置信度|confidence|Confidence/);
    }
  });

  it('四语说明都要说明这是编辑距离且越小越相似', () => {
    // 各语言的关键词不同，逐语言给判据，避免用某一种语言的词去测另一种。
    expect(notes.zh).toMatch(/编辑距离/);
    expect(notes.zh).toMatch(/越小/);
    expect(notes.en).toMatch(/edit[- ]distance/i);
    expect(notes.en).toMatch(/smaller/i);
    expect(notes.th).toMatch(/edit distance/i);
    expect(notes.ru).toMatch(/расстояни/i);
  });
});
