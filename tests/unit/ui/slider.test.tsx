import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { Slider } from '@/components/ui/slider';

// Slider 冒烟测试：渲染 thumb 并携带 aria-valuenow（后续 Playwright 探针依赖该属性），
// jsdom 不支持指针拖拽几何计算，值变更改用键盘事件驱动（ArrowRight）。
describe('Slider（@base-ui/react/slider 包装）', () => {
  it('渲染出 role=slider 的 thumb（原生 input[type=range]），aria-valuenow 反映当前值', () => {
    render(<Slider value={[80]} min={50} max={100} step={5} onValueChange={vi.fn()} />);
    const thumb = screen.getByRole('slider');
    expect(thumb).toHaveAttribute('aria-valuenow', '80');
    expect(thumb).toHaveAttribute('min', '50');
    expect(thumb).toHaveAttribute('max', '100');
  });

  it('键盘 ArrowRight 触发 onValueChange，按 step 递增', () => {
    const onValueChange = vi.fn();
    render(<Slider value={[80]} min={50} max={100} step={5} onValueChange={onValueChange} />);
    const thumb = screen.getByRole('slider');
    thumb.focus();
    fireEvent.keyDown(thumb, { key: 'ArrowRight' });
    expect(onValueChange).toHaveBeenCalledWith([85], expect.anything());
  });

  it('disabled=true 时 thumb 原生禁用（真实浏览器下禁用元素不再接收键盘事件；jsdom 不模拟该限制，故此处只断言 disabled 状态）', () => {
    render(<Slider value={[80]} min={50} max={100} step={5} disabled onValueChange={vi.fn()} />);
    const thumb = screen.getByRole('slider');
    expect(thumb).toBeDisabled();
  });

  it('轨道点击（pointerdown）触发 onValueChange 时同样回传数组（回归：base-ui 的 SliderControl 内部按 values.length>1 而非受控 value 是否为数组判定 range 模式，单滑块场景下指针路径会回传裸 number，导致消费方 `([v]) => ...` 解构崩溃 "number is not iterable"，仅键盘路径不受影响）', () => {
    // jsdom 未实现指针捕获相关 API，打桩为 no-op 使事件流程能跑通
    Element.prototype.setPointerCapture ??= vi.fn();
    Element.prototype.releasePointerCapture ??= vi.fn();
    Element.prototype.hasPointerCapture ??= vi.fn(() => false);

    const onValueChange = vi.fn();
    const { container } = render(
      <Slider value={[70]} min={50} max={100} step={5} onValueChange={onValueChange} />
    );
    const control = container.querySelector('[data-slot="slider-control"]') as HTMLElement;
    // jsdom 的 getBoundingClientRect 恒返回全 0，需打桩出非零宽度让内部几何换算能产出有效值
    control.getBoundingClientRect = () =>
      ({
        width: 200,
        height: 20,
        left: 0,
        top: 0,
        right: 200,
        bottom: 20,
        x: 0,
        y: 0,
        toJSON: () => {},
      }) as DOMRect;

    fireEvent.pointerDown(control, { clientX: 150, clientY: 10, button: 0, pointerId: 1 });

    expect(onValueChange).toHaveBeenCalled();
    const received = onValueChange.mock.calls[0][0];
    expect(Array.isArray(received)).toBe(true);
    expect(received).toEqual([expect.any(Number)]);
  });
});
