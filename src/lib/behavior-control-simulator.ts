import type { BehaviorDimension } from '@/types/behavior-control';

export interface BehaviorSimulationInputs {
  uniqueSenderIPCount: number;
  mailCount: number;
  recipientCount: number;
}

export interface BehaviorSimulationRequest {
  dimensionA: BehaviorDimension;
  thresholdA: number;
  orEnabled?: boolean;
  dimensionB?: BehaviorDimension;
  thresholdB?: number;
  inputs: BehaviorSimulationInputs;
}

export interface BehaviorSimulationHit {
  condition: 'A' | 'B';
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

function evaluateCondition(
  condition: 'A' | 'B',
  dimension: BehaviorDimension | undefined,
  threshold: number | undefined,
  inputs: BehaviorSimulationInputs,
): BehaviorSimulationHit | null {
  if (!dimension || !threshold || threshold <= 0) return null;
  const count = countForDimension(dimension, inputs);
  if (count === null || count < threshold) return null;
  return { condition, dimension, count, threshold };
}

// 模拟器只使用用户在抽屉中输入的样本数据，不调用后端接口。
export function simulateBehaviorControl(
  request: BehaviorSimulationRequest,
): BehaviorSimulationHit | null {
  const hitA = evaluateCondition(
    'A', request.dimensionA, request.thresholdA, request.inputs,
  );
  if (hitA) return hitA;
  if (!request.orEnabled) return null;
  return evaluateCondition(
    'B', request.dimensionB, request.thresholdB, request.inputs,
  );
}
