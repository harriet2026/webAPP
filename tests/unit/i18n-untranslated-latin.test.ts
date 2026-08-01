import { describe, it, expect } from 'vitest';
import zh from '@/../messages/zh.json';
import th from '@/../messages/th.json';
import ru from '@/../messages/ru.json';

// GT-11433：中文/泰文/俄文的词条值里夹着**未翻译的英文单词**，是这张单最实在
// 的一类问题——它不像"缺 key"那样会在控制台留下 MISSING_MESSAGE，页面看着正常，
// 只有人眼能发现。典型现场：disposalSettings 里 recallKeys 已译作"召回密钥"，
// 而同一节的 newRecallKey 仍是"新建 Recall Key"，自相矛盾。
//
// 这条守卫扫的是"值里出现受监控的英文词"，不是"值里有任何 ASCII"——
// 产品名、协议名、字段字面量（SPF/DKIM/HTTP/URL/ID）本来就不该翻译，
// 全量禁 ASCII 只会逼出一堆豁免、变成噪声。所以维护一份**明确的监控词表**：
// 只列那些"本可以译、却没译"的普通名词。发现新的漏译词就往表里加。
const WATCHED_WORDS = [
  'Recall Key',
  'Key Secret',
  'Key ID',
  'New ',
  'Enter ',
  'Save',
  'Cancel',
  'Delete',
  'Loading',
  'Success',
  'Failed',
];

// 白名单：这些路径下的值确实应当保留英文（多为协议/枚举字面量或示例值）。
// 加白名单必须写清理由——否则它会变成"测试红了就往里塞"的垃圾场。
const ALLOWED_PATHS: RegExp[] = [
  // 语言切换器里的语言自称，按惯例用各自语言书写。
  /^languageSwitcher\./,
  // 键盘按键名（Enter 键）是设备上的物理标签，不翻译。
  /^phishingConfig\.admission\.(email|tag)Placeholder$/,
];

function walk(obj: unknown, path: string, out: Array<[string, string]>) {
  if (typeof obj === 'string') {
    out.push([path, obj]);
    return;
  }
  if (obj && typeof obj === 'object') {
    for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
      walk(v, path ? `${path}.${k}` : k, out);
    }
  }
}

describe('非英语词条不得夹带未翻译的英文词 (GT-11433)', () => {
  for (const [lang, messages] of [['zh', zh], ['th', th], ['ru', ru]] as const) {
    it(`${lang}.json`, () => {
      const entries: Array<[string, string]> = [];
      walk(messages, '', entries);
      const offenders = entries.filter(([path, value]) => {
        if (ALLOWED_PATHS.some((re) => re.test(path))) return false;
        return WATCHED_WORDS.some((w) => value.includes(w));
      });
      expect(
        offenders.map(([p, v]) => `${p} = ${v}`),
        `${lang}.json 里有夹带英文的词条`,
      ).toEqual([]);
    });
  }
});
