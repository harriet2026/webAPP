import type { BehaviorDimension, BehaviorCondition } from '@/types/behavior-control';

export interface BehaviorSimulationInputs {
  uniqueSenderIPCount: number;
  mailCount: number;
  recipientCount: number;
}

export interface BehaviorSimulationRequest {
  conditions: BehaviorCondition[];
  orEnabled: boolean;
  inputs: BehaviorSimulationInputs;
  // 向下兼容旧调用
  dimensionA?: BehaviorDimension;
  thresholdA?: number;
  orEnabled_legacy?: boolean;
  dimensionB?: BehaviorDimension;
  thresholdB?: number;
}

export interface BehaviorSimulationHit {
  condition: string;
  dimension: BehaviorDimension;
  count: number;
  threshold: number;
}

function countForDimension(
  dimension: BehaviorDimension,
  inputs: BehaviorSimulationInputs,
): number | null {
  switch (dimension) {
    case 'ip_count':
      return inputs.uniqueSenderIPCount;
    case 'mail_count':
      return inputs.mailCount;
    case 'recipient_count':
      return inputs.recipientCount;
    // 模拟器当前没有附件大小样本输入，不能伪造该维度的命中结果。
    case 'attachment_size':
      return null;
  }
}

// 模拟器只使用用户在抽屉中输入的样本数据，不调用后端接口。
export function simulateBehaviorControl(
  request: BehaviorSimulationRequest,
): BehaviorSimulationHit | null {
  const { conditions, orEnabled, inputs } = request;

  if (!conditions || conditions.length === 0) return null;

  if (orEnabled) {
    // OR 模式：任一条件命中即触发
    for (let i = 0; i < conditions.length; i++) {
      const { dim, threshold } = conditions[i];
      if (!dim || !threshold || threshold <= 0) continue;
      const count = countForDimension(dim, inputs);
      if (count !== null && count >= threshold) {
        return { condition: String(i + 1), dimension: dim, count, threshold };
      }
    }
    return null;
  } else {
    // AND 模式：所有条件同时满足才触发，返回第一个命中的条件作为展示
    const allHit = conditions.every(({ dim, threshold }) => {
      if (!dim || !threshold || threshold <= 0) return false;
      const count = countForDimension(dim, inputs);
      return count !== null && count >= threshold;
    });
    if (!allHit) return null;
    const first = conditions[0];
    const count = countForDimension(first.dim, inputs);
    return { condition: '1', dimension: first.dim, count: count ?? 0, threshold: first.threshold };
  }
}
