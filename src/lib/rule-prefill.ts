'use client';

import type { CreateRuleRequest } from '@/types/unified-rules';

const RULE_PREFILL_PREFIX = 'osgateway.rule-prefill.';

export function createRulePrefillKey() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }

  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export function storeRulePrefill(key: string, request: CreateRuleRequest) {
  if (typeof window === 'undefined') {
    return false;
  }

  try {
    window.sessionStorage.setItem(`${RULE_PREFILL_PREFIX}${key}`, JSON.stringify(request));
    return true;
  } catch {
    return false;
  }
}

export function readRulePrefill(key: string): CreateRuleRequest | null {
  if (typeof window === 'undefined') {
    return null;
  }

  try {
    const raw = window.sessionStorage.getItem(`${RULE_PREFILL_PREFIX}${key}`);
    if (!raw) {
      return null;
    }
    return JSON.parse(raw) as CreateRuleRequest;
  } catch {
    return null;
  }
}

export function removeRulePrefill(key: string) {
  if (typeof window === 'undefined') {
    return;
  }

  try {
    window.sessionStorage.removeItem(`${RULE_PREFILL_PREFIX}${key}`);
  } catch {
    // ignore cleanup failures
  }
}
