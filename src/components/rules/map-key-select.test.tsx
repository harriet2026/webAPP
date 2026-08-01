import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MapKeySelect } from './MapKeySelect';

// GT-12685：档案引用键的形态是前后端契约。detection-profiles 源必须存
// profid:<id>（引擎在 precompute.go markProfileIDKey 写了同名别名），而
// groups 源的 id 本身就是引擎建键用的 tag（grp:<名>），必须原样存。
// 存错会让规则保存成功却恒不命中，且列表健康度看不出异常。
const mockApiRequest = vi.fn();
vi.mock('@/lib/api/client', () => ({
  useApiRequest: () => ({ apiRequest: mockApiRequest }),
}));

describe('MapKeySelect 的档案引用键形态 (GT-12685)', () => {
  beforeEach(() => {
    mockApiRequest.mockReset();
  });

  it('detection-profiles 源存 profid:<id> 而不是裸主键', async () => {
    mockApiRequest.mockResolvedValue({ items: [{ id: 114, name: '张三' }] });
    const onChange = vi.fn();
    render(
      <MapKeySelect
        mapSource="/api/v1/detection-profiles?config_type=exec_impersonation"
        value=""
        onChange={onChange}
      />,
    );
    const trigger = await screen.findByRole('combobox');
    await userEvent.click(trigger);
    await userEvent.click(await screen.findByRole('option', { name: /张三/ }));
    expect(onChange).toHaveBeenCalledWith('profid:114');
  });

  it('groups 源原样存 id（后端已把 id 设成引擎建键用的 tag）', async () => {
    mockApiRequest.mockResolvedValue({ items: [{ id: 'grp:vip', name: 'VIP 组' }] });
    const onChange = vi.fn();
    render(
      <MapKeySelect
        mapSource="/api/v1/unified-rules/_meta/groups?type=sender"
        value=""
        onChange={onChange}
      />,
    );
    const trigger = await screen.findByRole('combobox');
    await userEvent.click(trigger);
    await userEvent.click(await screen.findByRole('option', { name: /VIP 组/ }));
    expect(onChange).toHaveBeenCalledWith('grp:vip');
  });
});
