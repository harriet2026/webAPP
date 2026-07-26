import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

// 与本仓既有组件测试一致：把 next-intl 打桩成回显 key，只断言结构/状态，不断言文案。
vi.mock('next-intl', () => ({
  useTranslations: (namespace: string) => (key: string, params?: Record<string, string | number>) => {
    if (params && Object.keys(params).length > 0) return `${namespace}.${key}:${JSON.stringify(params)}`;
    return `${namespace}.${key}`;
  },
}));

vi.mock('@/lib/api/client', () => ({
  useApiRequest: () => ({ apiRequest: vi.fn() }),
}));

import { BasicLimitTab } from './BasicLimitTab';
import type { BasicLimitConfig } from '@/types/attachment-security';

// GT-12198 回归：修复"接受 0"时，输入框改成了每次 onChange 都 Number() 强转。
// 浏览器对 <input type="number"> 在内容不完整（刚敲下 "-"）时 .value 返回 ""，
// Number("") === 0 会把值改写成 0，受控重渲染再把用户敲的 "-" 顶掉，
// 于是 "-1"（不限制）根本打不出来 —— 工单被重新打开正是因为这个。
//
// 这类缺陷靠 isValidLimitValue 的纯函数用例抓不到（它们只覆盖取值判定，
// 不覆盖受控输入的中间态），所以这里补组件级用例。
function renderTab(overrides: Partial<BasicLimitConfig> = {}) {
  const config = {
    attachment_count_max: 10,
    attachment_size_max_kb: 10240,
    nested_zip_count_max: 2,
    nested_file_count_max: 20,
    nested_level_max: 2,
    scan_timeout_sec: 30,
    exceed_action: 'quarantine',
    ...overrides,
  } as unknown as BasicLimitConfig;
  const onChange = vi.fn();
  render(<BasicLimitTab direction="receive" config={config} onChange={onChange} />);
  return { onChange };
}

describe('BasicLimitTab attachment count input (GT-12198 regression)', () => {
  it('lets the user type -1 (unlimited) without the field being clobbered', async () => {
    const user = userEvent.setup();
    renderTab({ attachment_count_max: 10 });

    const input = screen.getByTestId('attachment-count-max') as HTMLInputElement;
    await user.clear(input);
    await user.type(input, '-1');

    // 关键断言：字段里就是 "-1"，没有在敲下 "-" 时被改写成 0
    expect(input.value).toBe('-1');
  });

  it('keeps the intermediate "-" visible while typing', async () => {
    const user = userEvent.setup();
    renderTab({ attachment_count_max: 10 });

    const input = screen.getByTestId('attachment-count-max') as HTMLInputElement;
    await user.clear(input);
    await user.type(input, '-');

    expect(input.value).toBe('-');
  });

  it('still flags 0 as invalid (the original GT-12198 defect stays fixed)', async () => {
    const user = userEvent.setup();
    renderTab({ attachment_count_max: 10 });

    const input = screen.getByTestId('attachment-count-max') as HTMLInputElement;
    await user.clear(input);
    await user.type(input, '0');

    expect(input.value).toBe('0');
    expect(screen.getByTestId('attachment-count-error')).toBeTruthy();
  });

  it('accepts a normal positive integer without error', async () => {
    const user = userEvent.setup();
    renderTab({ attachment_count_max: 10 });

    const input = screen.getByTestId('attachment-count-max') as HTMLInputElement;
    await user.clear(input);
    await user.type(input, '25');

    expect(input.value).toBe('25');
    expect(screen.queryByTestId('attachment-count-error')).toBeNull();
  });
});
