import { describe, it, expect } from 'vitest';
import en from '@/../messages/en.json';
import zh from '@/../messages/zh.json';
import ru from '@/../messages/ru.json';
import th from '@/../messages/th.json';

type MsgObj = Record<string, unknown>;
const locales: Record<string, MsgObj> = { en, zh, ru, th };

// GT-11636: 平台统一管控横幅 + 阶段1锁定占位所需 key。
// 在 4 个 locale (zh/en/ru/th) 必须全部存在且为非空字符串，
// 否则 PolicyPipelinePage 在多租户形态/租户视角下会渲染原始 key 字符串。
const STRING_PATHS: string[][] = [
  ['pipeline', 'platformManagedAlert'],
  ['pipeline', 'platformManaged'],
  ['pipeline', 'platformManagedHint'],
  // F10: stage5 综合策略抽屉宿主对齐 — 左导航摘要 + 面包屑 + 页级开关条文案。
  ['pipeline', 'advancedRulesSummary'],
  ['pipeline', 'comprehensiveBreadcrumb'],
  ['pipeline', 'comprehensiveEnabled'],
  ['pipeline', 'comprehensiveDisabled'],
  // html_spec 对齐（filter-rules-pipeline-html-spec-alignment）：阶段编号前缀、
  // 名单类型 / 流程控制 图例、阶段间箭头短标签，四语必须齐全，否则页面渲染原始 key。
  ['pipeline', 'stageTitleFormat'],
  ['pipeline', 'flowTerminateShort'],
  ['pipeline', 'flowQuarantineShort'],
  ['pipeline', 'flowContinueShort'],
  ['pipeline', 'listTypeLegend'],
  ['pipeline', 'blacklistType'],
  ['pipeline', 'blacklistTypeDesc'],
  ['pipeline', 'whitelistType'],
  ['pipeline', 'whitelistTypeDesc'],
  ['pipeline', 'flowTerminateDesc'],
  ['pipeline', 'flowContinueDesc'],
];

function getPath(obj: unknown, path: string[]): unknown {
  let cur: unknown = obj;
  for (const seg of path) {
    if (cur == null || typeof cur !== 'object') return undefined;
    cur = (cur as Record<string, unknown>)[seg];
  }
  return cur;
}

describe('PolicyPipelinePage i18n parity (GT-11636)', () => {
  for (const [name, msg] of Object.entries(locales)) {
    for (const path of STRING_PATHS) {
      it(`${name} has ${path.join('.')}`, () => {
        const v = getPath(msg, path);
        expect(typeof v === 'string' && v.length > 0, `${name} missing ${path.join('.')}`).toBe(true);
      });
    }
  }
});