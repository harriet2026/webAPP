import { useState } from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import zh from '@/../messages/zh.json';
import type { ObserveDurationBucket } from '@/lib/api/rule-effectiveness-view';
import { FilterBar } from './FilterBar';
import { MODULE_FILTER_OPTIONS, stageModuleOptions, resolveModuleFilterParams, type ModuleFilterOption } from './constants';

// 受控包装：与 RuleEffectivenessPage 一样由父级持有筛选状态，空数组表示全选。
const state: { modules: ModuleFilterOption[]; buckets: ObserveDurationBucket[] } = { modules: [], buckets: [] };

function Harness() {
  const [modules, setModules] = useState<ModuleFilterOption[]>([]);
  const [buckets, setBuckets] = useState<ObserveDurationBucket[]>([]);
  return (
    <NextIntlClientProvider locale="zh" messages={zh as never}>
      <FilterBar
        timeRange="7d"
        onTimeRangeChange={() => {}}
        customRange={{ start: '', end: '' }}
        onCustomRangeChange={() => {}}
        moduleOptions={modules}
        onModuleOptionsChange={(m) => { state.modules = m; setModules(m); }}
        durationBuckets={buckets}
        onDurationBucketsChange={(b) => { state.buckets = b; setBuckets(b); }}
        onReset={() => {}}
      />
    </NextIntlClientProvider>
  );
}

const isChecked = (testid: string) => screen.getByTestId(testid).querySelector('svg') !== null;
const bucket = (b: string) => `rule-effectiveness-duration-option-${b}`;
const mod = (m: string) => `rule-effectiveness-module-option-${m}`;

// GT-14375：默认全选时，点击已勾选的项应取消该项（而不是变成只选这一项）；
// 最后一项不能被取消；重新勾满后回到全选（空数组，不带筛选参数）。
describe('rule effectiveness multi-select filters (GT-14375)', () => {
  beforeEach(() => { state.modules = []; state.buckets = []; });

  it('unchecks the clicked bucket when starting from all-selected', () => {
    render(<Harness />);
    fireEvent.click(screen.getByTestId('rule-effectiveness-duration-filter'));
    expect(isChecked(bucket('lt7'))).toBe(true);

    fireEvent.click(screen.getByTestId(bucket('lt7')));

    expect(state.buckets).toEqual(['7to30', 'gt30']);
    expect(isChecked(bucket('lt7'))).toBe(false);
    expect(isChecked(bucket('7to30'))).toBe(true);
    expect(isChecked(bucket('gt30'))).toBe(true);
  });

  it('keeps the last remaining bucket selected and returns to all when re-checked', () => {
    render(<Harness />);
    fireEvent.click(screen.getByTestId('rule-effectiveness-duration-filter'));
    fireEvent.click(screen.getByTestId(bucket('lt7')));
    fireEvent.click(screen.getByTestId(bucket('7to30')));
    expect(state.buckets).toEqual(['gt30']);

    fireEvent.click(screen.getByTestId(bucket('gt30')));
    expect(state.buckets).toEqual(['gt30']);
    expect(isChecked(bucket('gt30'))).toBe(true);
    expect(isChecked(bucket('lt7'))).toBe(false);

    fireEvent.click(screen.getByTestId(bucket('lt7')));
    fireEvent.click(screen.getByTestId(bucket('7to30')));
    expect(state.buckets).toEqual([]);
  });

  it('applies the same rules to the module filter', () => {
    render(<Harness />);
    fireEvent.click(screen.getByTestId('rule-effectiveness-module-filter'));
    fireEvent.click(screen.getByTestId(mod('auth_spoofing')));

    expect(state.modules).toEqual(MODULE_FILTER_OPTIONS.filter((option) => option !== 'auth_spoofing'));
    expect(isChecked(mod('auth_spoofing'))).toBe(false);

    for (const option of MODULE_FILTER_OPTIONS.filter((option) => !['auth_spoofing', 'phishing_detection'].includes(option))) {
      fireEvent.click(screen.getByTestId(mod(option)));
    }
    fireEvent.click(screen.getByTestId(mod('phishing_detection')));
    expect(state.modules).toEqual(['phishing_detection']);

    for (const option of MODULE_FILTER_OPTIONS.filter((option) => option !== 'phishing_detection')) {
      fireEvent.click(screen.getByTestId(mod(option)));
    }
    expect(state.modules).toEqual([]);
  });
});

it('queries only a complete calendar range and orders reverse selections (GT-14083)', async () => {
  const onChange = vi.fn();
  render(<NextIntlClientProvider locale="zh" messages={zh as never}>
    <FilterBar timeRange="custom" onTimeRangeChange={() => {}}
      customRange={{ start: '2026-09-01', end: '2026-09-07' }} onCustomRangeChange={onChange}
      moduleOptions={[]} onModuleOptionsChange={() => {}} durationBuckets={[]}
      onDurationBucketsChange={() => {}} onReset={() => {}} />
  </NextIntlClientProvider>);
  fireEvent.click(screen.getByTestId('rule-effectiveness-custom-date-filter'));
  fireEvent.click(screen.getByTestId('rule-effectiveness-custom-date-filter-day-2026-09-20'));
  expect(onChange).not.toHaveBeenCalled();
  fireEvent.click(screen.getByTestId('rule-effectiveness-custom-date-filter-day-2026-09-19'));
  await waitFor(() => expect(onChange).toHaveBeenCalledExactlyOnceWith({ start: '2026-09-19', end: '2026-09-20' }));
});

it('maps a selected stage to bounded module filters, including split similar policies', () => {
  expect(resolveModuleFilterParams(stageModuleOptions('stage3'))).toEqual({
    modules: ['content_rules', 'attachment_security', 'intent_engine'], similarDetectionTypes: [],
  });
  expect(resolveModuleFilterParams(stageModuleOptions('stage5'))).toEqual({
    modules: ['similar_detection', 'advanced_filter_rules'], similarDetectionTypes: ['similar_email', 'same_subject'],
  });
});
