import { describe, it, expect, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { ThemeColorProvider, useThemeColor } from './theme-color-context';

function wrapper({ children }: { children: React.ReactNode }) {
  return <ThemeColorProvider>{children}</ThemeColorProvider>;
}

describe('ThemeColorProvider / useThemeColor (component-theme-switcher)', () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.removeAttribute('data-theme-color');
  });

  it('defaults to blue and applies data-theme-color on mount', () => {
    const { result } = renderHook(() => useThemeColor(), { wrapper });
    expect(result.current.themeColor).toBe('blue');
    expect(document.documentElement.getAttribute('data-theme-color')).toBe('blue');
  });

  it('setThemeColor updates state, persists to localStorage, and swaps the html attribute', () => {
    const { result } = renderHook(() => useThemeColor(), { wrapper });
    act(() => result.current.setThemeColor('green'));
    expect(result.current.themeColor).toBe('green');
    expect(localStorage.getItem('theme-color')).toBe('green');
    expect(document.documentElement.getAttribute('data-theme-color')).toBe('green');
  });

  it('restores a persisted theme on mount', () => {
    localStorage.setItem('theme-color', 'green');
    const { result } = renderHook(() => useThemeColor(), { wrapper });
    expect(result.current.themeColor).toBe('green');
    expect(document.documentElement.getAttribute('data-theme-color')).toBe('green');
  });

  it('falls back to blue for an invalid persisted value', () => {
    localStorage.setItem('theme-color', 'purple');
    const { result } = renderHook(() => useThemeColor(), { wrapper });
    expect(result.current.themeColor).toBe('blue');
  });
});
