import { describe, it, expect } from 'vitest';
import { createTranslator } from 'next-intl';
import zh from '../../messages/zh.json';
import en from '../../messages/en.json';
import th from '../../messages/th.json';
import ru from '../../messages/ru.json';

/**
 * GT-12614：错误码文案必须能被**真实的 next-intl** 解析出来。
 *
 * 为什么需要这条测试：Go 侧的漂移守卫只把 messages JSON 当普通 map 读，
 * 断言 "apiErrors 里有这个 key"。但 next-intl 把点号一律当层级分隔符——
 * 写成扁平的 {"apiErrors": {"tenant.not_found": "..."}} 时：
 *   1. t('apiErrors.tenant.not_found') 解析不到（MISSING_MESSAGE，退回 key）；
 *   2. useTranslations() 取根命名空间还会抛 INVALID_KEY，直接打断组件渲染。
 * 两个后果都不会让 Go 守卫变红，属于典型的"测试全绿、线上全废"。
 *
 * 这条测试走的是产品代码同一条解析路径（createTranslator + 完整点号 key），
 * 所以扁平化一旦回潮就会红。
 */
const LOCALES = { zh, en, th, ru } as const;

function collectCodes(node: unknown, prefix = ''): string[] {
  if (typeof node === 'string') return [prefix];
  if (node && typeof node === 'object') {
    return Object.entries(node as Record<string, unknown>).flatMap(([k, v]) =>
      collectCodes(v, prefix ? `${prefix}.${k}` : k),
    );
  }
  return [];
}

describe('apiErrors 文案可被 next-intl 解析（GT-12614）', () => {
  const codes = collectCodes((zh as Record<string, unknown>).apiErrors);

  it('zh.json 的 apiErrors 至少覆盖数百个错误码（防止误删整节后本测试空跑通过）', () => {
    expect(codes.length).toBeGreaterThan(300);
  });

  for (const [locale, messages] of Object.entries(LOCALES)) {
    it(`${locale}: 每个错误码都能解析出非 key 的真实文案`, () => {
      const t = createTranslator({ locale, messages: messages as never });
      const broken: string[] = [];
      for (const code of codes) {
        const key = `apiErrors.${code}`;
        // 带占位符的文案必须喂参数，否则 next-intl 抛 FORMATTING_ERROR 并退回 key——
        // 那是"参数没传"的信号，不是"文案不存在"，两者要分开判。
        const template = String(
          code.split('.').reduce<unknown>((acc, part) => (acc as Record<string, unknown>)?.[part],
            (messages as Record<string, unknown>).apiErrors) ?? '',
        );
        const values: Record<string, string> = {};
        for (const m of template.matchAll(/\{(\w+)\}/g)) values[m[1]] = 'X';
        let rendered: string;
        try {
          rendered = t(key as never, values as never) as unknown as string;
        } catch {
          broken.push(`${code} (抛异常)`);
          continue;
        }
        // 未命中时 next-intl 原样返回 key —— 这正是线上"看到 apiErrors.xxx"的成因。
        if (typeof rendered !== 'string' || rendered === key || rendered.startsWith('apiErrors.')) {
          broken.push(code);
        }
      }
      expect(broken.slice(0, 20), `${broken.length} 个错误码解析失败`).toEqual([]);
    });
  }

  it('apiErrors 里不得出现含点号的扁平键（会让 useTranslations() 抛 INVALID_KEY）', () => {
    const flat: string[] = [];
    const walk = (node: unknown, path: string) => {
      if (!node || typeof node !== 'object') return;
      for (const [k, v] of Object.entries(node as Record<string, unknown>)) {
        if (k.includes('.')) flat.push(path ? `${path}.${k}` : k);
        walk(v, path ? `${path}.${k}` : k);
      }
    };
    for (const [locale, messages] of Object.entries(LOCALES)) {
      flat.length = 0;
      walk((messages as Record<string, unknown>).apiErrors, '');
      expect(flat, `${locale}.json 的 apiErrors 存在扁平点号键`).toEqual([]);
    }
  });
});
