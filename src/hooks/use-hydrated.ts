'use client';

import { useSyncExternalStore } from 'react';

const emptySubscribe = () => () => {};

/**
 * SSR/水合安全的「已挂载」判定：服务端与客户端首次渲染恒为 false，
 * 水合完成后变为 true。等价于 mounted-state + useEffect 模式，但不触发
 * react-hooks/set-state-in-effect，也少一次手写 state。
 */
export function useHydrated(): boolean {
  return useSyncExternalStore(
    emptySubscribe,
    () => true,
    () => false,
  );
}
