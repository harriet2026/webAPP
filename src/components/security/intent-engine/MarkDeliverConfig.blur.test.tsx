import { useState } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

// 与本仓既有组件测试一致：把 next-intl 打桩成回显 key，只断言结构/状态，不断言文案。
vi.mock('next-intl', () => ({
  useTranslations: (ns: string) => (key: string) => `${ns}.${key}`,
}));

import { ProceedMarkConfig } from './ProceedMarkConfig';
import { DEFAULT_MARK_TEXT } from '@/types/intent-engine';
import type { IntentMarkConfig } from '@/types/intent-engine';

// GT-12204：html_spec 层级6（v3）要求标记文案输入框「清空并失焦」时回填该意图的
// 默认文案（订阅类为 [订阅]）。此前只有 IntentEnginePage.handleSave 的 D-11 在
// *保存时*兜底回填，输入框本身失焦后是空的——用户看到空框，误以为标记会落空，
// 且在保存前无法确认最终生效文案。
// ProceedMarkConfig 是受控组件：value 完全由父级提供。必须用有状态的包装器把
// onChange 真正写回 value，否则输入框永远显示初始文案，清空动作根本不生效，
// 测出来的就不是产品行为（第一版用裸 vi.fn() 就踩了这个坑）。
function renderCfg(intent: 'subscription' | 'phishing' = 'subscription') {
  const onChange = vi.fn();
  function Harness() {
    const [value, setValue] = useState<IntentMarkConfig>({
      subject_mark: { enabled: true, text: DEFAULT_MARK_TEXT[intent], position: 'prefix' },
      header_mark: { enabled: true, name: 'X-OSG-Intent', value: DEFAULT_MARK_TEXT[intent] },
    });
    return (
      <ProceedMarkConfig
        value={value}
        intent={intent}
        onChange={(next) => { onChange(next); setValue(next); }}
      />
    );
  }
  render(<Harness />);
  return { onChange };
}

describe('ProceedMarkConfig 清空失焦回填默认文案 (GT-12204)', () => {
  it('主题标记清空后失焦，回填该意图默认文案', async () => {
    const user = userEvent.setup();
    const { onChange } = renderCfg('subscription');

    const input = screen.getByTestId('ie-subject_mark-text') as HTMLInputElement;
    await user.clear(input);
    await user.tab(); // 失焦

    const last = onChange.mock.calls.at(-1)?.[0] as IntentMarkConfig;
    expect(last?.subject_mark?.text).toBe(DEFAULT_MARK_TEXT.subscription);
  });

  // GT-12204 REQ-1 的另一半（v3 双重期望）：placeholder 也应是该意图默认文案，
  // 而非固定的“标记文案”，让空态即可看到将落入的默认值。
  it('placeholder 同步为该意图默认文案（订阅=[订阅]）', () => {
    renderCfg('subscription');
    const subInput = screen.getByTestId('ie-subject_mark-text') as HTMLInputElement;
    expect(subInput.placeholder).toBe(DEFAULT_MARK_TEXT.subscription);
    const headerValue = screen.getByTestId('ie-header_mark-value') as HTMLInputElement;
    expect(headerValue.placeholder).toBe('intentEngine.markConfig.headerValue');
  });

  it('只输入空白字符后失焦，同样回填默认文案', async () => {
    const user = userEvent.setup();
    const { onChange } = renderCfg('subscription');

    const input = screen.getByTestId('ie-subject_mark-text') as HTMLInputElement;
    await user.clear(input);
    await user.type(input, '   ');
    await user.tab();

    const last = onChange.mock.calls.at(-1)?.[0] as IntentMarkConfig;
    expect(last?.subject_mark?.text).toBe(DEFAULT_MARK_TEXT.subscription);
  });

  it('信头值清空后失焦回填默认文案', async () => {
    const user = userEvent.setup();
    const { onChange } = renderCfg('subscription');

    const input = screen.getByTestId('ie-header_mark-value') as HTMLInputElement;
    await user.clear(input);
    await user.tab();

    const last = onChange.mock.calls.at(-1)?.[0] as IntentMarkConfig;
    expect(last?.header_mark?.value).toBe(DEFAULT_MARK_TEXT.subscription);
  });

  it('用户填了非空文案时失焦不改写', async () => {
    const user = userEvent.setup();
    const { onChange } = renderCfg('subscription');

    const input = screen.getByTestId('ie-subject_mark-text') as HTMLInputElement;
    await user.clear(input);
    // 注意：user.type 把 [ ] 当按键描述符语法，自定义文案里不能直接带方括号。
    await user.type(input, '自定义标记');
    onChange.mockClear();
    await user.tab();

    // 失焦不应再产生一次把文案改回默认的 onChange
    const calls = onChange.mock.calls.map((c) => (c[0] as IntentMarkConfig)?.subject_mark?.text);
    expect(calls.every((t) => t !== DEFAULT_MARK_TEXT.subscription)).toBe(true);
  });

  it('回填用的是当前意图的默认文案，而非固定订阅文案', async () => {
    const user = userEvent.setup();
    const { onChange } = renderCfg('phishing');

    const input = screen.getByTestId('ie-subject_mark-text') as HTMLInputElement;
    await user.clear(input);
    await user.tab();

    const last = onChange.mock.calls.at(-1)?.[0] as IntentMarkConfig;
    expect(last?.subject_mark?.text).toBe(DEFAULT_MARK_TEXT.phishing);
  });
});
