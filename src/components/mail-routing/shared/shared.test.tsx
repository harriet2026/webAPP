import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NextIntlClientProvider } from 'next-intl';
import type { ReactNode } from 'react';
import type { ProbeStatus } from '../mr-types';
import zh from '@/../messages/zh.json';
import { TooltipProvider } from '@/components/ui/tooltip';
import { ListToolbar } from './list-toolbar';
import { ProbeBadge } from './probe-badge';
import { TestResultTag } from './test-result-tag';
import { TagInput } from './tag-input';

// 邮件路由 html_spec 对齐基建（Task 1）：mr-types + 五个共享组件，供后续四个 Tab 复用。
// 对齐 doc/html-spec/admin-forwarding/index.html §2.2（ListToolbar）与 §2.7（共享状态组件）。

function wrap(ui: ReactNode) {
  return (
    <NextIntlClientProvider locale="zh" messages={zh as unknown as Record<string, unknown>}>
      <TooltipProvider>{ui}</TooltipProvider>
    </NextIntlClientProvider>
  );
}

describe('ListToolbar', () => {
  it('renders search / reset / filter testids', () => {
    render(
      wrap(
        <ListToolbar
          search=""
          onSearchChange={() => {}}
          searchPlaceholder="搜索…"
          onReset={() => {}}
          filterContent={<div>筛选内容</div>}
          testIdPrefix="rt"
        />,
      ),
    );
    expect(screen.getByTestId('rt-search')).toBeInTheDocument();
    expect(screen.getByTestId('rt-reset')).toBeInTheDocument();
    expect(screen.getByTestId('rt-filter')).toBeInTheDocument();
  });

  it('shows a blue filter count badge when filterCount > 0', () => {
    const { container } = render(
      wrap(
        <ListToolbar
          search=""
          onSearchChange={() => {}}
          searchPlaceholder="搜索…"
          onReset={() => {}}
          filterCount={2}
          filterContent={<div>筛选内容</div>}
          testIdPrefix="rt"
        />,
      ),
    );
    const badge = screen.getByTestId('rt-filter').querySelector('.bg-blue-600');
    expect(badge).toBeTruthy();
    expect(badge).toHaveTextContent('2');
    // filterCount = 0（无生效筛选）不出计数徽章
    render(
      wrap(
        <ListToolbar
          search=""
          onSearchChange={() => {}}
          searchPlaceholder="搜索…"
          onReset={() => {}}
          filterCount={0}
          filterContent={<div>筛选内容</div>}
          testIdPrefix="rt2"
        />,
      ),
      { container: container.appendChild(document.createElement('div')) },
    );
    expect(screen.getByTestId('rt2-filter').querySelector('.bg-blue-600')).toBeFalsy();
  });

  it('calls onSearchChange / onReset', async () => {
    const user = userEvent.setup();
    const onSearchChange = vi.fn();
    const onReset = vi.fn();
    render(
      wrap(
        <ListToolbar
          search=""
          onSearchChange={onSearchChange}
          searchPlaceholder="搜索…"
          onReset={onReset}
          testIdPrefix="rt3"
        />,
      ),
    );
    await user.type(screen.getByTestId('rt3-search'), 'x');
    expect(onSearchChange).toHaveBeenCalled();
    await user.click(screen.getByTestId('rt3-reset'));
    expect(onReset).toHaveBeenCalledTimes(1);
  });
});

describe('ProbeBadge', () => {
  it.each([
    ['normal', '正常'],
    ['abnormal', '异常'],
    ['unchecked', '未检测'],
  ] as const)('renders %s state text', (status, text) => {
    render(wrap(<ProbeBadge status={status} testId={`pb-${status}`} />));
    expect(screen.getByTestId(`pb-${status}`)).toHaveTextContent(text);
  });

  it('renders partial state with (abnormal/total) count', () => {
    render(wrap(<ProbeBadge status="partial" abnormalCount={2} total={4} testId="pb-partial" />));
    expect(screen.getByTestId('pb-partial')).toHaveTextContent('部分异常（2/4）');
  });

  it('renders an invalid runtime status as unchecked instead of resolving an invalid message key', () => {
    render(wrap(<ProbeBadge status={undefined as unknown as ProbeStatus} testId="pb-legacy" />));
    expect(screen.getByTestId('pb-legacy')).toHaveTextContent('未检测');
  });
});

describe('TestResultTag', () => {
  it('renders null when idle', () => {
    const { container } = render(wrap(<TestResultTag state="idle" testId="tt" />));
    expect(container.textContent).toBe('');
  });

  it('renders loading / ok / fail text', () => {
    const { rerender } = render(wrap(<TestResultTag state="loading" testId="tt" />));
    expect(screen.getByTestId('tt')).toHaveTextContent('测试中…');
    rerender(wrap(<TestResultTag state="ok" testId="tt" />));
    expect(screen.getByTestId('tt')).toHaveTextContent('连通正常');
    rerender(wrap(<TestResultTag state="fail" testId="tt" />));
    expect(screen.getByTestId('tt')).toHaveTextContent('连接失败：超时');
  });
});

describe('TagInput', () => {
  it('commits a tag on Enter', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(wrap(<TagInput value={[]} onChange={onChange} testIdPrefix="ti" />));
    const input = screen.getByTestId('ti-input');
    await user.type(input, '10.0.0.1{Enter}');
    expect(onChange).toHaveBeenCalledWith(['10.0.0.1']);
  });

  it('shows invalidHint and does not commit an invalid value', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      wrap(
        <TagInput
          value={[]}
          onChange={onChange}
          validate={() => false}
          invalidHint="需为合法 IP 或域名"
          testIdPrefix="ti2"
        />,
      ),
    );
    await user.type(screen.getByTestId('ti2-input'), 'not-valid{Enter}');
    expect(screen.getByTestId('ti2-error')).toHaveTextContent('需为合法 IP 或域名');
    expect(onChange).not.toHaveBeenCalled();
  });

  it('removes the last tag on Backspace when input is empty', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(wrap(<TagInput value={['a.com', 'b.com']} onChange={onChange} testIdPrefix="ti3" />));
    await user.click(screen.getByTestId('ti3-input'));
    await user.keyboard('{Backspace}');
    expect(onChange).toHaveBeenCalledWith(['a.com']);
  });
});
