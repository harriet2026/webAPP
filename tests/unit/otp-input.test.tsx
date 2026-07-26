import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { OtpInput } from '@/components/login/otp-input';

// Helper: render OtpInput with stateful value so each onChange flows back as
// the new `value` prop (mirrors how the real login page uses it). Returns
// helpers to read the current value and rerender.
function renderControlled(initial = '', length = 6) {
  let value = initial;
  const onChange = vi.fn((v: string) => {
    value = v;
  });
  const utils = render(<OtpInput value={value} onChange={onChange} length={length} />);
  const sync = () => utils.rerender(<OtpInput value={value} onChange={onChange} length={length} />);
  return {
    ...utils,
    onChange,
    get value() {
      return value;
    },
    sync,
    inputs: () => screen.getAllByRole('textbox'),
  };
}

describe('OtpInput', () => {
  it('collects 6 digits across the boxes', () => {
    const u = renderControlled();
    const inputs = u.inputs();
    expect(inputs).toHaveLength(6);
    '123456'.split('').forEach((d, i) => {
      fireEvent.change(inputs[i], { target: { value: d } });
      u.sync();
    });
    expect(u.value).toBe('123456');
  });

  it('ignores non-digit input', () => {
    const u = renderControlled();
    const [first] = u.inputs();
    fireEvent.change(first, { target: { value: 'a' } });
    expect(u.value).toBe('');
    fireEvent.change(first, { target: { value: '5' } });
    expect(u.value).toBe('5');
  });

  it('blocks non-digit keys via keydown', () => {
    const u = renderControlled();
    const [first] = u.inputs();
    const prevented = fireEvent.keyDown(first, { key: 'a' });
    expect(prevented).toBe(false);
  });

  it('paste fills all boxes from a longer clipboard string', () => {
    const u = renderControlled();
    const [first] = u.inputs();
    fireEvent.paste(first, {
      clipboardData: { getData: () => '987654' },
    });
    expect(u.value).toBe('987654');
  });

  it('paste strips letters and truncates to length', () => {
    const u = renderControlled();
    const [first] = u.inputs();
    fireEvent.paste(first, {
      clipboardData: { getData: () => 'a1b2c3d4e5f6g7' },
    });
    expect(u.value).toBe('123456');
  });

  it('renders the controlled value padded to length', () => {
    const u = renderControlled('12');
    const inputs = u.inputs();
    expect(inputs[0]).toHaveValue('1');
    expect(inputs[1]).toHaveValue('2');
    expect(inputs[2]).toHaveValue('');
  });

  it('Backspace on empty box clears the previous digit', () => {
    const u = renderControlled('123');
    const inputs = u.inputs();
    inputs[3].focus();
    fireEvent.keyDown(inputs[3], { key: 'Backspace' });
    expect(u.value).toBe('12');
  });

  it('Backspace on a filled box clears just that box', () => {
    const u = renderControlled('123');
    const inputs = u.inputs();
    inputs[2].focus();
    fireEvent.keyDown(inputs[2], { key: 'Backspace' });
    expect(u.value).toBe('12');
  });
});

