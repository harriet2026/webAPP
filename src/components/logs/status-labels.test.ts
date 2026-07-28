import { describe, it, expect } from 'vitest';
import zh from '@/../messages/zh.json';
import {
  DELIVERY_STATUS_KEYS, WORKFLOW_OUTCOME_KEYS,
  deliveryStatusLabel, workflowOutcomeLabel,
} from './status-labels';

// GT-12610 防回归：投递状态/工作流结果的每个枚举值在 zh 字典里都必须有
// 对应词条（否则中文环境又会裸渲染英文枚举）；未知值原文透出。
type Dict = Record<string, unknown>;
const logs = (zh as Dict).logs as Dict;

describe('GT-12610 status labels', () => {
  it('every delivery status enum has a zh entry', () => {
    const dict = logs.deliveryStatusValue as Record<string, string>;
    for (const k of DELIVERY_STATUS_KEYS) {
      expect(dict[k], `logs.deliveryStatusValue.${k} 缺失`).toBeTruthy();
    }
  });

  it('every workflow outcome enum has a zh entry', () => {
    const dict = logs.workflowOutcomeValue as Record<string, string>;
    for (const k of WORKFLOW_OUTCOME_KEYS) {
      expect(dict[k], `logs.workflowOutcomeValue.${k} 缺失`).toBeTruthy();
    }
  });

  it('labels translate known values and pass through unknown values', () => {
    const t = (key: string) => `T(${key})`;
    expect(deliveryStatusLabel('delivered', t)).toBe('T(logs.deliveryStatusValue.delivered)');
    expect(workflowOutcomeLabel('bounced', t)).toBe('T(logs.workflowOutcomeValue.bounced)');
    expect(deliveryStatusLabel('weird_new_status', t)).toBe('weird_new_status');
    expect(workflowOutcomeLabel('weird', t)).toBe('weird');
  });

  it('AI interpret error/tool keys and download error keys exist in zh', () => {
    const ai = ((logs.email as Dict).aiInterpret) as Dict;
    expect((ai.errors as Dict).timeout).toBeTruthy();
    expect((ai.errors as Dict).llmUnavailable).toBeTruthy();
    expect((ai.errors as Dict).generic).toBeTruthy();
    expect(ai.ruleQueryGeneric).toBeTruthy();
    expect(ai.toolGeneric).toBeTruthy();
    const dl = ((zh as Dict).linkLogs as Dict).downloadErrors as Dict;
    for (const k of ['invalidId', 'notFound', 'generic']) {
      expect(dl[k], `linkLogs.downloadErrors.${k} 缺失`).toBeTruthy();
    }
  });
});
