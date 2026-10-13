import { createTranslator } from 'next-intl';
import { describe, expect, it } from 'vitest';

import en from '../../../../messages/en.json';
import ru from '../../../../messages/ru.json';
import th from '../../../../messages/th.json';
import zh from '../../../../messages/zh.json';
import { authSpoofingRuleLabelKeys } from '@/lib/auth_spoofing_rule_labels';
import { strategyPathLabels } from './constants';
import type { RuleEffectivenessRow } from '@/lib/api/rule-effectiveness-view';

const locales = { en, ru, th, zh } as const;

describe('rule effectiveness strategy path labels', () => {
  it.each(Object.entries(locales))('localizes built-in authentication result keys in %s', (locale, messages) => {
    const translatePath = createTranslator({ locale, messages, namespace: 'ruleEffectiveness.path' });
    const translateAuth = createTranslator({ locale, messages, namespace: 'authSpoofing' });
    const pathLabel = (key: string) => translatePath(key as Parameters<typeof translatePath>[0]);
    const authLabel = (key: string) => translateAuth(key as Parameters<typeof translateAuth>[0]);
    const row = {
      policy_module: 'auth_spoofing',
      sub_strategy_id: 'dkim_fail',
      sub_strategy_name_snapshot: 'dkim_fail',
    } as RuleEffectivenessRow;

    const labels = strategyPathLabels(row, pathLabel, authLabel);

    expect(labels).toEqual([
      pathLabel('authSpoofing'),
      authLabel('protocolChecks.dkim'),
      authLabel('protocolChecks.dkim_fail'),
    ]);
    expect(labels).not.toContain('dkim_fail');
  });

  it('localizes every protocol result reported by GT-14314', () => {
    const translatePath = createTranslator({ locale: 'zh', messages: zh, namespace: 'ruleEffectiveness.path' });
    const translateAuth = createTranslator({ locale: 'zh', messages: zh, namespace: 'authSpoofing' });
    const pathLabel = (key: string) => translatePath(key as Parameters<typeof translatePath>[0]);
    const authLabel = (key: string) => translateAuth(key as Parameters<typeof translateAuth>[0]);
    const resultKeys = [
      'dkim_fail',
      'dkim_neutral',
      'dkim_none',
      'dkim_partial',
      'dkim_permerror',
      'dkim_temperror',
      'dmarc_none',
      'dmarc_no_record',
      'dmarc_quarantine',
      'dmarc_query_fail',
      'dmarc_reject',
    ];

    resultKeys.forEach((resultKey) => {
      const row = {
        policy_module: 'auth_spoofing',
        sub_strategy_id: resultKey,
        sub_strategy_name_snapshot: resultKey,
      } as RuleEffectivenessRow;
      const authLabelKeys = authSpoofingRuleLabelKeys(resultKey);

      expect(authLabelKeys).toBeDefined();
      expect(strategyPathLabels(row, pathLabel, authLabel)).toEqual([
        pathLabel('authSpoofing'),
        ...authLabelKeys!.map((key) => authLabel(key)),
      ]);
    });
  });

  // GT-14321：统计页的格式检查项名称必须与配置页同一检查项的名称一致，且空/无效两项可区分。
  it.each(Object.entries(locales))('names MAIL FROM format checks exactly as the config page in %s', (locale, messages) => {
    const translatePath = createTranslator({ locale, messages, namespace: 'ruleEffectiveness.path' });
    const translateAuth = createTranslator({ locale, messages, namespace: 'authSpoofing' });
    const pathLabel = (key: string) => translatePath(key as Parameters<typeof translatePath>[0]);
    const authLabel = (key: string) => translateAuth(key as Parameters<typeof translateAuth>[0]);
    const last = (subStrategyId: string) => strategyPathLabels({
      policy_module: 'auth_spoofing',
      sub_strategy_id: subStrategyId,
      sub_strategy_name_snapshot: subStrategyId,
    } as RuleEffectivenessRow, pathLabel, authLabel).at(-1);

    const empty = last('format_check_mailfrom_empty');
    const invalid = last('format_check_mailfrom_invalid');
    expect(empty).toBe(authLabel('formatChecks.mailFromEmpty'));
    expect(invalid).toBe(authLabel('formatChecks.mailFromInvalid'));
    expect(empty).not.toBe(invalid);
  });

  // GT-14317：相似检测的方向名称必须与相似检测配置页一致（接收方向 / 外发方向 / 域内方向），
  // 未启用全方向聚合时不得显示为全方向聚合。
  it.each(Object.entries(locales))('names similar detection directions exactly as the config page in %s', (locale, messages) => {
    const translatePath = createTranslator({ locale, messages, namespace: 'ruleEffectiveness.path' });
    const translateAuth = createTranslator({ locale, messages, namespace: 'authSpoofing' });
    const translateSimilar = createTranslator({ locale, messages, namespace: 'similarDetection' });
    const pathLabel = (key: string) => translatePath(key as Parameters<typeof translatePath>[0]);
    const authLabel = (key: string) => translateAuth(key as Parameters<typeof translateAuth>[0]);
    const configLabel = (key: string) => translateSimilar(key as Parameters<typeof translateSimilar>[0]);
    const last = (type: 'similar_email' | 'same_subject', scope: 'receive' | 'send' | 'internal' | 'aggregate') => strategyPathLabels({
      policy_module: 'similar_detection',
      sub_strategy_id: `${type}.${scope}`,
      sub_strategy_name_snapshot: `${type}.${scope}`,
      similar_detection_type: type,
      similar_detection_scope: scope,
    } as RuleEffectivenessRow, pathLabel, authLabel).at(-1);

    for (const type of ['similar_email', 'same_subject'] as const) {
      expect(last(type, 'receive')).toBe(configLabel('directionReceiveFull'));
      expect(last(type, 'send')).toBe(configLabel('directionSendFull'));
      expect(last(type, 'internal')).toBe(configLabel('directionInternalFull'));
      expect(last(type, 'aggregate')).toBe(pathLabel('aggregateScope'));
    }
  });

  it('keeps the name snapshot fallback for custom authentication strategies', () => {
    const translatePath = createTranslator({ locale: 'zh', messages: zh, namespace: 'ruleEffectiveness.path' });
    const translateAuth = createTranslator({ locale: 'zh', messages: zh, namespace: 'authSpoofing' });
    const pathLabel = (key: string) => translatePath(key as Parameters<typeof translatePath>[0]);
    const authLabel = (key: string) => translateAuth(key as Parameters<typeof translateAuth>[0]);
    const row = {
      policy_module: 'auth_spoofing',
      sub_strategy_id: 'custom-auth-rule',
      sub_strategy_name_snapshot: '自定义认证规则',
    } as RuleEffectivenessRow;

    expect(strategyPathLabels(row, pathLabel, authLabel)).toEqual([
      pathLabel('authSpoofing'),
      '自定义认证规则',
    ]);
  });

  it('does not treat inherited object properties as built-in strategy keys', () => {
    const translatePath = createTranslator({ locale: 'zh', messages: zh, namespace: 'ruleEffectiveness.path' });
    const translateAuth = createTranslator({ locale: 'zh', messages: zh, namespace: 'authSpoofing' });
    const pathLabel = (key: string) => translatePath(key as Parameters<typeof translatePath>[0]);
    const authLabel = (key: string) => translateAuth(key as Parameters<typeof translateAuth>[0]);
    const row = {
      policy_module: 'auth_spoofing',
      sub_strategy_id: 'toString',
      sub_strategy_name_snapshot: 'toString',
    } as RuleEffectivenessRow;

    expect(strategyPathLabels(row, pathLabel, authLabel)).toEqual([
      pathLabel('authSpoofing'),
      'toString',
    ]);
  });
});

// 处置规则是当前观察对象；旧对象键仅用于历史记录展示。
describe('phishing detection strategy path (GT-14347)', () => {
  const zhPath = createTranslator({ locale: 'zh', messages: zh, namespace: 'ruleEffectiveness.path' });
  const zhAuth = createTranslator({ locale: 'zh', messages: zh, namespace: 'authSpoofing' });
  const labelsOf = (key: string, name: string, pathLabel = (k: string) => zhPath(k as Parameters<typeof zhPath>[0])) => strategyPathLabels(
    { policy_module: 'phishing_detection', sub_strategy_id: key, sub_strategy_name_snapshot: name } as RuleEffectivenessRow,
    pathLabel,
    (k: string) => zhAuth(k as Parameters<typeof zhAuth>[0]),
  );

  it.each([
    ['disposition:suspicious', '可疑', ['钓鱼检测智能体', '风险处置策略', '可疑']],
    ['disposition:low', '低风险', ['钓鱼检测智能体', '风险处置策略', '低风险']],
    ['disposition:medium', '中风险', ['钓鱼检测智能体', '风险处置策略', '中风险']],
    ['disposition:high', '高风险', ['钓鱼检测智能体', '风险处置策略', '高风险']],
    ['runtime_policy', '运行时策略', ['钓鱼检测智能体', '运行时策略']],
    ['risk_policy', '风险处置策略', ['钓鱼检测智能体', '风险处置策略']],
    ['admission:8f1c2d3e-uid', '外部链接邮件', ['钓鱼检测智能体', '准入规则', '外部链接邮件']],
    // 未知对象键兜底追加名称快照，仍能与其他行区分。
    ['engine_v2', '新检测对象', ['钓鱼检测智能体', '新检测对象']],
  ])('%s', (key, name, expected) => {
    expect(labelsOf(key, name)).toEqual(expected);
  });

  it.each(Object.entries(locales))('localizes phishing object kinds in %s', (locale, messages) => {
    const translatePath = createTranslator({ locale, messages, namespace: 'ruleEffectiveness.path' });
    const pathLabel = (k: string) => translatePath(k as Parameters<typeof translatePath>[0]);
    for (const key of ['disposition:suspicious', 'disposition:low', 'disposition:medium', 'disposition:high', 'runtime_policy', 'risk_policy', 'admission:uid']) {
      const labels = labelsOf(key, 'rule-name', pathLabel);
      expect(labels[1]).toBeTruthy();
      expect(labels[1]).not.toMatch(/^ruleEffectiveness\.path\.|^phishing[A-Z]/);
      expect(labels[1]).not.toBe(key);
    }
  });
});
