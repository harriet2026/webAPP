// 客户端 mock 开关的本地存储。
// 与产品形态切换器耦合：开关本身放在 ProductFormSwitcher 下拉菜单里，
// 状态用 localStorage 持久化（key: osg_mock_enabled），刷新后保留。
// 实际的数据拦截发生在 src/lib/api/client.ts 的 apiRequest 入口。

const STORAGE_KEY = 'osgateway_mock_enabled';

type Listener = (enabled: boolean) => void;
const listeners = new Set<Listener>();

export function isMockEnabled(): boolean {
  if (typeof window === 'undefined') return false;
  return localStorage.getItem(STORAGE_KEY) === '1';
}

export function setMockEnabled(enabled: boolean): void {
  if (typeof window === 'undefined') return;
  if (enabled) {
    localStorage.setItem(STORAGE_KEY, '1');
  } else {
    localStorage.removeItem(STORAGE_KEY);
  }
  // 通知所有订阅者（ProductFormSwitcher 的开关 UI 要同步勾选状态）。
  listeners.forEach((l) => {
    try {
      l(enabled);
    } catch {
      // listener 抛错不应影响其他订阅者
    }
  });
}

export function toggleMock(): boolean {
  const next = !isMockEnabled();
  setMockEnabled(next);
  return next;
}

export function subscribeMockEnabled(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
