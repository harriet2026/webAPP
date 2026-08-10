import '@testing-library/jest-dom/vitest';

// Base UI's ScrollArea consults Web Animations after mounting. jsdom does not
// implement getAnimations, so provide the browser-compatible empty result.
if (!HTMLElement.prototype.getAnimations) {
  HTMLElement.prototype.getAnimations = () => [];
}

// Node >= 25 exposes a global `localStorage`/`sessionStorage` (Web Storage). When
// the process is started without `--localstorage-file` it is an empty plain
// object with no getItem/setItem, and it shadows the working jsdom implementation
// inside vitest's jsdom environment. Any code touching storage (isMockEnabled,
// getStoredUser, ...) then dies with "localStorage.getItem is not a function".
// Install a Map-backed Storage whenever the ambient one is unusable.
function installStorageShim(name: 'localStorage' | 'sessionStorage'): void {
  const existing = (globalThis as Record<string, unknown>)[name] as Storage | undefined;
  if (existing && typeof existing.getItem === 'function') return;

  const store = new Map<string, string>();
  const shim: Storage = {
    get length() {
      return store.size;
    },
    key: (i: number) => Array.from(store.keys())[i] ?? null,
    getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
    setItem: (k: string, v: string) => void store.set(k, String(v)),
    removeItem: (k: string) => void store.delete(k),
    clear: () => store.clear(),
  };
  Object.defineProperty(globalThis, name, { value: shim, configurable: true, writable: true });
  if (typeof window !== 'undefined') {
    Object.defineProperty(window, name, { value: shim, configurable: true, writable: true });
  }
}

installStorageShim('localStorage');
installStorageShim('sessionStorage');

// cmdk（Command 组件）在挂载时构造 ResizeObserver；jsdom 没有实现。
// 全局补一个 no-op stub，让所有用到 Command/Popover 组合的单测可运行。
if (typeof globalThis.ResizeObserver === 'undefined') {
  class ResizeObserverStub {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  Object.defineProperty(globalThis, 'ResizeObserver', {
    value: ResizeObserverStub,
    configurable: true,
    writable: true,
  });
}

// cmdk 在按键/搜索时会对高亮项调用 scrollIntoView 以保持其可见；jsdom 未实现该
// API。补一个 no-op，避免所有 Command 列表交互测试因 "scrollIntoView is not a
// function" 崩溃。
if (!HTMLElement.prototype.scrollIntoView) {
  HTMLElement.prototype.scrollIntoView = () => {};
}
