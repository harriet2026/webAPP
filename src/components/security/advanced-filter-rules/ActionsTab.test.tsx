import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

// Mirrors the mocking convention used elsewhere in the codebase (see
// RescanPolicySection.test.tsx): echo `namespace.key` instead of resolving
// real message catalogs, so these tests assert structure/DOM state, not
// translated copy (that's covered by i18n-literal-keys.test.ts + the
// per-locale parity check done for this task).
vi.mock('next-intl', () => ({
  useTranslations: (namespace: string) => (key: string, params?: Record<string, string | number>) => {
    if (params && Object.keys(params).length > 0) {
      return `${namespace}.${key}:${JSON.stringify(params)}`;
    }
    return `${namespace}.${key}`;
  },
}));

import { ActionsTab } from './ActionsTab';
import { emptyRuleForm, type RuleForm } from './rule-form';

// ActionsTab.test.ts(x) — manual smoke coverage for the layer-4 conflict
// matrix's three states (task F7 step 3: "手测冲突矩阵三态"), automated so it
// keeps passing after future refactors instead of being a one-off manual
// check. Exercises AddonsRowList's disabled/opacity gating for each state via
// ActionsTab's actual render tree (not a re-implementation of disabledAddons).

function renderTab(primaryAction: RuleForm['primaryAction']) {
  const form: RuleForm = { ...emptyRuleForm(), primaryAction };
  render(<ActionsTab form={form} setForm={vi.fn()} fieldDefs={{}} />);
}

function rowIsDisabled(key: string): boolean {
  const row = screen.getByTestId(`addon-row-${key}`);
  return row.className.includes('opacity-50') && row.className.includes('cursor-not-allowed');
}

describe('ActionsTab — conflict matrix three states', () => {
  // GT-12185: 三项策略均已实测接通；none 不与任何 addon 冲突。
  it('none: no addon row is conflict-disabled', () => {
    renderTab('none');
    // Conflict-free rows must be clickable.
    expect(rowIsDisabled('disclaimer')).toBe(false);
    expect(rowIsDisabled('adminNotify')).toBe(false);
    expect(rowIsDisabled('emailTag')).toBe(false);
    expect(rowIsDisabled('modifyHeader')).toBe(false);
    // 后端已接通且经真实邮件验证，无冲突时应可配置。
    expect(rowIsDisabled('deleteAttachment')).toBe(false);
    expect(rowIsDisabled('externalReminder')).toBe(false);
    expect(rowIsDisabled('forwardServer')).toBe(false);
  });

  it('quarantine: forwardServer and modifyHeader are conflict-disabled, others unaffected', () => {
    renderTab('quarantine');
    expect(rowIsDisabled('forwardServer')).toBe(true); // conflict AND stored-not-wired
    expect(rowIsDisabled('modifyHeader')).toBe(true); // conflict-only
    expect(rowIsDisabled('disclaimer')).toBe(false);
    expect(rowIsDisabled('adminNotify')).toBe(false);
    expect(rowIsDisabled('emailTag')).toBe(false);
  });

  it('block: only adminNotify remains available, the other six addon rows are disabled', () => {
    renderTab('block');
    expect(rowIsDisabled('adminNotify')).toBe(false);
    expect(rowIsDisabled('disclaimer')).toBe(true);
    expect(rowIsDisabled('externalReminder')).toBe(true);
    expect(rowIsDisabled('deleteAttachment')).toBe(true);
    expect(rowIsDisabled('emailTag')).toBe(true);
    expect(rowIsDisabled('forwardServer')).toBe(true);
    expect(rowIsDisabled('modifyHeader')).toBe(true);
  });

  it('discard: same disabled set as block (only adminNotify available)', () => {
    renderTab('discard');
    expect(rowIsDisabled('adminNotify')).toBe(false);
    expect(rowIsDisabled('disclaimer')).toBe(true);
    expect(rowIsDisabled('modifyHeader')).toBe(true);
  });

  it('none-action left hint and required-hint render when nothing is savable', () => {
    renderTab('none');
    expect(screen.getByTestId('none-action-hint')).toBeTruthy();
    expect(screen.getByTestId('actions-left-required-hint')).toBeTruthy();
    expect(screen.queryByTestId('configure-action-button')).toBeNull();
  });

  it('configure-action-button appears once a non-none action is selected', () => {
    renderTab('block');
    expect(screen.getByTestId('configure-action-button')).toBeTruthy();
    expect(screen.queryByTestId('none-action-hint')).toBeNull();
  });
});
