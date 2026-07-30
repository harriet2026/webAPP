'use client';

/**
 * UnsavedGuardContext
 *
 * 全局「未保存修改」拦截上下文。
 * - 某个页面/组件调用 registerGuard() 注册 dirty 状态和可选的「保存后离开」回调。
 * - 侧栏导航在执行 router.push 前调用 requestNavigate(href)：
 *   若当前有 dirty guard，弹出确认对话框；否则直接放行。
 * - 页面卸载时调用 unregisterGuard() 清除注册，避免残留拦截。
 */

import { createContext, useContext, useRef, useState, useCallback } from 'react';

export interface UnsavedGuardRegistration {
  /** 当前是否有未保存修改 */
  isDirty: boolean;
  /** 保存后离开的回调；若提供则弹窗显示「保存后离开」选项 */
  onSave?: () => Promise<void>;
}

interface PendingNavigation {
  href: string;
  resolve: (proceed: boolean) => void;
}

interface UnsavedGuardContextValue {
  /** 注册 dirty guard（通常在 useEffect 中调用） */
  registerGuard: (reg: UnsavedGuardRegistration) => void;
  /** 注销 guard */
  unregisterGuard: () => void;
  /**
   * 侧栏 / 任意导航调用此方法代替直接 router.push。
   * 返回 true 表示可以导航，false 表示用户取消。
   */
  requestNavigate: (href: string, push: (href: string) => void) => void;
  /** 当前是否正在等待用户确认（用于渲染 AlertDialog） */
  pendingNav: PendingNavigation | null;
  /** 当前注册的 guard（用于 AlertDialog 读取 isDirty / onSave） */
  currentGuard: UnsavedGuardRegistration | null;
  /** 用户选择「继续编辑」 */
  handleKeepEditing: () => void;
  /** 用户选择「放弃修改并离开」 */
  handleDiscardAndLeave: () => void;
  /** 用户选择「保存后离开」 */
  handleSaveAndLeave: () => Promise<void>;
  /** 保存中状态，防止重复点击 */
  isSaving: boolean;
}

const UnsavedGuardContext = createContext<UnsavedGuardContextValue | null>(null);

export function UnsavedGuardProvider({ children }: { children: React.ReactNode }) {
  const guardRef = useRef<UnsavedGuardRegistration | null>(null);
  const [currentGuard, setCurrentGuard] = useState<UnsavedGuardRegistration | null>(null);
  const [pendingNav, setPendingNav] = useState<PendingNavigation | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  // 存储待执行的 push 函数，确认后调用
  const pendingPushRef = useRef<((href: string) => void) | null>(null);

  const registerGuard = useCallback((reg: UnsavedGuardRegistration) => {
    guardRef.current = reg;
    setCurrentGuard(reg);
  }, []);

  const unregisterGuard = useCallback(() => {
    guardRef.current = null;
    setCurrentGuard(null);
  }, []);

  const requestNavigate = useCallback((href: string, push: (href: string) => void) => {
    const guard = guardRef.current;
    if (!guard?.isDirty) {
      push(href);
      return;
    }
    pendingPushRef.current = push;
    setPendingNav({
      href,
      resolve: (proceed) => {
        if (proceed) push(href);
        setPendingNav(null);
      },
    });
  }, []);

  const handleKeepEditing = useCallback(() => {
    pendingNav?.resolve(false);
  }, [pendingNav]);

  const handleDiscardAndLeave = useCallback(() => {
    pendingNav?.resolve(true);
  }, [pendingNav]);

  const handleSaveAndLeave = useCallback(async () => {
    if (!pendingNav || !currentGuard?.onSave) return;
    setIsSaving(true);
    try {
      await currentGuard.onSave();
      // 保存成功后执行导航
      if (pendingPushRef.current) {
        pendingPushRef.current(pendingNav.href);
      }
      setPendingNav(null);
    } catch {
      // 保存失败：停留在页面，弹窗关闭（错误由 onSave 内部 toast 已提示）
      setPendingNav(null);
    } finally {
      setIsSaving(false);
    }
  }, [pendingNav, currentGuard]);

  return (
    <UnsavedGuardContext.Provider
      value={{
        registerGuard,
        unregisterGuard,
        requestNavigate,
        pendingNav,
        currentGuard,
        handleKeepEditing,
        handleDiscardAndLeave,
        handleSaveAndLeave,
        isSaving,
      }}
    >
      {children}
    </UnsavedGuardContext.Provider>
  );
}

export function useUnsavedGuard() {
  const ctx = useContext(UnsavedGuardContext);
  if (!ctx) throw new Error('useUnsavedGuard must be used within UnsavedGuardProvider');
  return ctx;
}
