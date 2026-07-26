import { describe, it, expect } from 'vitest';
import {
  STAGE_META,
  VERDICT_META,
  RESULT_META,
  ACTION_META,
  STAGE_ORDER,
  actionMeta,
  resultMeta,
  deepInspectStateMeta,
  DEEP_INSPECT_STATE_META,
} from './meta';

describe('link-logs meta', () => {
  it('covers exactly the three detection stages + none (no sandbox)', () => {
    expect(Object.keys(STAGE_META).sort()).toEqual(['cloud_intel', 'local_blacklist', 'none', 'phishing_agent']);
    expect(STAGE_META).not.toHaveProperty('sandbox');
  });
  it('timeline order is the three sequential stages', () => {
    expect(STAGE_ORDER).toEqual(['local_blacklist', 'cloud_intel', 'phishing_agent']);
  });
  it('verdict/result/action maps carry labelKey + color', () => {
    for (const m of [VERDICT_META.malicious, RESULT_META.alerted, ACTION_META.proceeded]) {
      expect(typeof m.labelKey).toBe('string');
      expect(typeof m.color).toBe('string');
    }
    expect(Object.keys(VERDICT_META).sort()).toEqual(['malicious', 'phishing', 'safe', 'suspicious']);
    expect(Object.keys(RESULT_META).sort()).toEqual(['alerted', 'passed', 'pending']);
    expect(Object.keys(ACTION_META).sort()).toEqual(['abandoned', 'none', 'proceeded', 'skipped_deep_inspect']);
  });
});

describe('link-logs meta v2', () => {
  it('时间线顺序改为 本地黑名单 → 云端情报 → 深度复检', () => {
    expect(STAGE_ORDER).toEqual(['local_blacklist', 'cloud_intel', 'phishing_agent']);
  });

  it('user_action 支持 skipped_deep_inspect（橙色）', () => {
    const m = actionMeta('skipped_deep_inspect');
    expect(m).toBeTruthy();
    expect(m.color).toContain('orange');
  });

  it('final_result 支持 pending（灰色「检测中」）', () => {
    expect(resultMeta('pending').color).toContain('gray');
  });

  it('deep_inspect_state 六态齐备', () => {
    expect(Object.keys(DEEP_INSPECT_STATE_META).sort()).toEqual([
      'cached',
      'done',
      'running',
      'skipped',
      'timeout',
      'user_skipped',
    ]);
    for (const s of ['skipped', 'running', 'cached', 'done', 'timeout', 'user_skipped']) {
      expect(deepInspectStateMeta(s)).toBeTruthy();
    }
  });

  it('deep_inspect_state unknown 回退', () => {
    const m = deepInspectStateMeta('totally-bogus');
    expect(m.labelKey).toBe('linkLogs.deepInspect.unknown');
  });
});
