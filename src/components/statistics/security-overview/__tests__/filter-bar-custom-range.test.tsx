import { render, screen, fireEvent, act } from '@testing-library/react';
import { useCallback, useState } from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { FilterBar, CUSTOM_RANGE_DEBOUNCE_MS } from '../FilterBar';
import { defaultCustomRange, type CustomRange } from '../date-range';
import type { TimeRange } from '@/lib/api/security-overview';

// GT-11979 / GT-11930: the time filter only had 5 preset buttons. PRD F1 requires
// "时间范围(今天/近7天/…/上月)、自定义起止日期"; §4.1 requires start <= end.
//
// The contract pinned here: FilterBar holds the in-progress draft and only
// propagates a range that PASSES validation, after the edits settle. If it
// propagated on every keystroke, a half-typed date would reach the query — and
// worse, editing only the START endpoint would fire a query for
// {newStart, oldEnd}, an interval the user never asked for that can approach the
// 366-day cap.

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string, vars?: Record<string, unknown>) => {
    const dict: Record<string, string> = {
      'direction.label': '邮件方向',
      'direction.all': '全部',
      'direction.receive': '接收',
      'direction.send': '外发',
      'direction.internal': '域内',
      'timeRange.today': '今天',
      'timeRange.7d': '近7天',
      'timeRange.30d': '近30天',
      'timeRange.this_month': '本月',
      'timeRange.last_month': '上月',
      'timeRange.custom': '自定义',
      'customRange.start': '开始日期',
      'customRange.end': '结束日期',
      'customRange.error.invalid': '请选择起止日期',
      'customRange.error.order': '结束日期不能早于开始日期',
      'customRange.error.tooLong': `时间跨度不能超过 ${vars?.max} 天`,
      comparePrevious: '对比上一周期',
    };
    return dict[key] ?? key;
  },
}));

const onCustomRangeChange = vi.fn();

/** Let the debounce elapse. */
function settle() {
  act(() => {
    vi.advanceTimersByTime(CUSTOM_RANGE_DEBOUNCE_MS + 10);
  });
}

function setup(timeRange: TimeRange = 'custom') {
  return render(
    <FilterBar
      direction="all"
      onDirectionChange={vi.fn()}
      timeRange={timeRange}
      onTimeRangeChange={vi.fn()}
      customRange={{ start: '2026-05-15', end: '2026-05-21' }}
      onCustomRangeChange={onCustomRangeChange}
      comparePrevious={false}
      onComparePreviousChange={vi.fn()}
    />,
  );
}

const startInput = () => screen.getByLabelText('开始日期');
const endInput = () => screen.getByLabelText('结束日期');

beforeEach(() => {
  vi.useFakeTimers();
  onCustomRangeChange.mockClear();
});
afterEach(() => vi.useRealTimers());

describe('FilterBar custom date range (GT-11979 / GT-11930)', () => {
  it('offers 自定义 alongside the five presets', () => {
    setup('7d');
    for (const label of ['今天', '近7天', '近30天', '本月', '上月', '自定义']) {
      expect(screen.getByRole('button', { name: label })).toBeInTheDocument();
    }
  });

  it('shows the date inputs only when 自定义 is the active range', () => {
    const { unmount } = setup('7d');
    expect(screen.queryByLabelText('开始日期')).not.toBeInTheDocument();
    unmount();

    setup('custom');
    expect(startInput()).toBeInTheDocument();
    expect(endInput()).toBeInTheDocument();
  });

  it('seeds the inputs from the range the page passed in', () => {
    setup();
    expect(startInput()).toHaveValue('2026-05-15');
    expect(endInput()).toHaveValue('2026-05-21');
  });

  it('propagates a valid range once the edits settle', () => {
    setup();
    fireEvent.change(endInput(), { target: { value: '2026-05-25' } });
    settle();

    expect(onCustomRangeChange).toHaveBeenCalledTimes(1);
    expect(onCustomRangeChange).toHaveBeenCalledWith({ start: '2026-05-15', end: '2026-05-25' });
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('does NOT fire a query for the half-edited {newStart, oldEnd} interval', () => {
    setup();
    // The user wants 2025-08-01 ~ 2025-09-01. They edit start first. The
    // intermediate {2025-08-01, 2026-05-21} is *valid* (~294 days) — propagating
    // it would scan most of a year of mail_log for a range nobody asked for.
    fireEvent.change(startInput(), { target: { value: '2025-08-01' } });
    fireEvent.change(endInput(), { target: { value: '2025-09-01' } });
    settle();

    expect(onCustomRangeChange).toHaveBeenCalledTimes(1);
    expect(onCustomRangeChange).toHaveBeenCalledWith({ start: '2025-08-01', end: '2025-09-01' });
  });

  it('does NOT propagate an end-before-start range — it shows an error instead', () => {
    setup();
    fireEvent.change(endInput(), { target: { value: '2026-05-01' } });
    settle();

    expect(onCustomRangeChange).not.toHaveBeenCalled();
    expect(screen.getByRole('alert')).toHaveTextContent('结束日期不能早于开始日期');
  });

  it('does NOT propagate a range over the 366-day cap', () => {
    setup();
    fireEvent.change(startInput(), { target: { value: '2020-01-01' } });
    settle();

    expect(onCustomRangeChange).not.toHaveBeenCalled();
    expect(screen.getByRole('alert')).toHaveTextContent('时间跨度不能超过 366 天');
  });

  it('does NOT propagate a cleared date', () => {
    setup();
    fireEvent.change(startInput(), { target: { value: '' } });
    settle();

    expect(onCustomRangeChange).not.toHaveBeenCalled();
    expect(screen.getByRole('alert')).toHaveTextContent('请选择起止日期');
  });

  it('keeps the invalid draft visible so the user can fix it, then recovers', () => {
    setup();
    fireEvent.change(endInput(), { target: { value: '2026-05-01' } });
    settle();
    expect(endInput()).toHaveValue('2026-05-01'); // draft is NOT snapped back
    expect(onCustomRangeChange).not.toHaveBeenCalled();

    fireEvent.change(endInput(), { target: { value: '2026-05-30' } });
    settle();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(onCustomRangeChange).toHaveBeenCalledTimes(1);
    expect(onCustomRangeChange).toHaveBeenCalledWith({ start: '2026-05-15', end: '2026-05-30' });
  });
});

// Review finding (Medium): FilterBar is never unmounted when the user leaves
// 自定义 — only the date-input JSX is conditional — so a rejected draft used to
// survive the round trip. Keying the re-seed effect on `customRange` alone cannot
// fix it: an invalid draft never propagates, so `customRange` never changes on
// exactly the path that needs resetting. The effect must also watch `timeRange`.
//
// A constant `customRange` prop (as every test above passes) can never exercise
// this. It needs a real parent that owns the state — which is why the bug got
// through the first round of tests.
function Harness() {
  const [timeRange, setTimeRange] = useState<TimeRange>('custom');
  const [customRange, setCustomRange] = useState<CustomRange>({ start: '2026-05-15', end: '2026-05-21' });
  const onChange = useCallback((r: CustomRange) => {
    setCustomRange(r);
    onCustomRangeChange(r);
  }, []);
  return (
    <>
      <FilterBar
        direction="all"
        onDirectionChange={vi.fn()}
        timeRange={timeRange}
        onTimeRangeChange={setTimeRange}
        customRange={customRange}
        onCustomRangeChange={onChange}
        comparePrevious={false}
        onComparePreviousChange={vi.fn()}
      />
      <output data-testid="queried">{`${customRange.start}..${customRange.end}`}</output>
    </>
  );
}

describe('FilterBar re-seeding across timeRange switches (review finding)', () => {
  const queried = () => screen.getByTestId('queried').textContent;

  it('discards a rejected draft when the user leaves and re-enters 自定义', () => {
    render(<Harness />);

    fireEvent.change(endInput(), { target: { value: '2026-05-01' } }); // invalid
    settle();
    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(queried()).toBe('2026-05-15..2026-05-21'); // charts still on last valid

    fireEvent.click(screen.getByRole('button', { name: '近7天' }));
    fireEvent.click(screen.getByRole('button', { name: '自定义' }));

    // The bug: the stale 2026-05-01 and its red alert came back, contradicting
    // the range the charts were actually showing.
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(endInput()).toHaveValue('2026-05-21');
    expect(startInput()).toHaveValue('2026-05-15');
  });

  it('discards a cleared date the same way', () => {
    render(<Harness />);

    fireEvent.change(startInput(), { target: { value: '' } });
    settle();
    expect(screen.getByRole('alert')).toHaveTextContent('请选择起止日期');

    fireEvent.click(screen.getByRole('button', { name: '今天' }));
    fireEvent.click(screen.getByRole('button', { name: '自定义' }));

    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(startInput()).toHaveValue('2026-05-15');
  });

  it('a pending debounce does not land after the user switches away', () => {
    render(<Harness />);

    fireEvent.change(endInput(), { target: { value: '2026-05-30' } }); // valid, still pending
    fireEvent.click(screen.getByRole('button', { name: '近7天' }));    // bail out before it fires
    settle();

    // The abandoned edit must not retroactively become the queried range.
    expect(onCustomRangeChange).not.toHaveBeenCalled();
    expect(queried()).toBe('2026-05-15..2026-05-21');
  });

  it('a valid range still round-trips through the parent', () => {
    render(<Harness />);

    fireEvent.change(endInput(), { target: { value: '2026-05-30' } });
    settle();

    expect(queried()).toBe('2026-05-15..2026-05-30');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    // the re-seed effect fires on the new customRange — the draft must survive it
    expect(endInput()).toHaveValue('2026-05-30');
  });

  it('the seeded default range is valid, so 自定义 never opens in an error state', () => {
    // (defaultCustomRange is what SecurityOverviewPage seeds its state with)
    expect(validateOK(defaultCustomRange(new Date('2026-07-12T10:00:00')))).toBe(true);
  });
});

function validateOK(r: CustomRange): boolean {
  render(
    <FilterBar
      direction="all"
      onDirectionChange={vi.fn()}
      timeRange="custom"
      onTimeRangeChange={vi.fn()}
      customRange={r}
      onCustomRangeChange={vi.fn()}
      comparePrevious={false}
      onComparePreviousChange={vi.fn()}
    />,
  );
  return screen.queryByRole('alert') === null;
}
