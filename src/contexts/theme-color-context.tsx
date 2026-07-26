'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useSyncExternalStore,
  type ReactNode,
} from 'react';

/**
 * 蓝/绿主题色（对齐 demo 原型 component-theme-switcher / theme-context.tsx）。
 *
 * 这是与明/暗模式（next-themes）正交的一个「品牌配色」轴：切换只改品牌主色 + 侧栏
 * 配色（见 globals.css 的 `[data-theme-color="green"]` 覆盖块），威胁语义色不受影响。
 * 状态持久化到 localStorage `theme-color`，并通过 <html data-theme-color> 应用。
 *
 * 用 useSyncExternalStore 读 localStorage（React 官方推荐的外部可变状态读取方式），
 * 天然处理 SSR/hydration，且不触发 react-hooks/set-state-in-effect。
 *
 * 注意：这是一个刻意偏离 DESIGN.md（单一蓝品牌 + 绿=威胁语义）的产品决策，
 * 经用户确认后落地（/html-spec-to-webapp component-theme-switcher，方案「全量蓝/绿主题」）。
 */
export type ThemeColor = 'blue' | 'green';

const STORAGE_KEY = 'theme-color';
const DEFAULT_THEME: ThemeColor = 'blue';

function isThemeColor(v: string | null): v is ThemeColor {
  return v === 'blue' || v === 'green';
}

function applyThemeColor(color: ThemeColor) {
  if (typeof document !== 'undefined') {
    document.documentElement.setAttribute('data-theme-color', color);
  }
}

// —— 外部存储（localStorage）的最小 pub/sub，供 useSyncExternalStore 使用 ——
const listeners = new Set<() => void>();

function notify() {
  listeners.forEach((l) => l());
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  // 跨标签页同步（其它标签改了主题，本标签也刷新）
  if (typeof window !== 'undefined') window.addEventListener('storage', cb);
  return () => {
    listeners.delete(cb);
    if (typeof window !== 'undefined') window.removeEventListener('storage', cb);
  };
}

function getSnapshot(): ThemeColor {
  if (typeof window === 'undefined') return DEFAULT_THEME;
  return isThemeColor(localStorage.getItem(STORAGE_KEY)) ? (localStorage.getItem(STORAGE_KEY) as ThemeColor) : DEFAULT_THEME;
}

function getServerSnapshot(): ThemeColor {
  return DEFAULT_THEME;
}

interface ThemeColorContextType {
  themeColor: ThemeColor;
  setThemeColor: (color: ThemeColor) => void;
}

const ThemeColorContext = createContext<ThemeColorContextType | undefined>(undefined);

export function ThemeColorProvider({ children }: { children: ReactNode }) {
  const themeColor = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  // 把当前主题应用到 <html data-theme-color>（挂载即生效，含从 localStorage 恢复的值）。
  useEffect(() => {
    applyThemeColor(themeColor);
  }, [themeColor]);

  const setThemeColor = useCallback((color: ThemeColor) => {
    if (typeof window !== 'undefined') {
      localStorage.setItem(STORAGE_KEY, color);
    }
    applyThemeColor(color);
    notify(); // 同标签页内触发订阅者重渲染
  }, []);

  return (
    <ThemeColorContext.Provider value={{ themeColor, setThemeColor }}>
      {children}
    </ThemeColorContext.Provider>
  );
}

export function useThemeColor() {
  const context = useContext(ThemeColorContext);
  if (context === undefined) {
    throw new Error('useThemeColor must be used within a ThemeColorProvider');
  }
  return context;
}
