'use client';

import { createContext, useCallback, useContext, useEffect, useState } from 'react';

const STORAGE_KEY = 'osgateway_sidebar_collapsed';

interface SidebarCollapseContextType {
  /** Persistent, user-controlled collapsed state (icon-only rail). */
  collapsed: boolean;
  /** Toggle the persistent collapsed state and mirror it to localStorage. */
  toggleCollapsed: () => void;
  /** Set the persistent collapsed state explicitly. */
  setCollapsed: (value: boolean) => void;
}

const SidebarCollapseContext = createContext<SidebarCollapseContextType | null>(null);

/**
 * Owns the *persistent* sidebar collapsed state only. The transient
 * hover-peek state is intentionally NOT here — it lives locally inside the
 * shell so a hover never re-renders the header or page content.
 *
 * Hydration: the first client render always starts expanded (matching SSR) and
 * corrects to the stored value in an effect, so there is no hydration mismatch.
 */
export function SidebarCollapseProvider({ children }: { children: React.ReactNode }) {
  const [collapsed, setCollapsedState] = useState(false);

  useEffect(() => {
    try {
      if (localStorage.getItem(STORAGE_KEY) === 'true') {
        // eslint-disable-next-line react-hooks/set-state-in-effect -- hydrate from browser-only localStorage after mount to avoid SSR mismatch.
        setCollapsedState(true);
      }
    } catch {
      /* localStorage unavailable (private mode / SSR) — keep default expanded. */
    }
  }, []);

  const setCollapsed = useCallback((value: boolean) => {
    setCollapsedState(value);
    try {
      localStorage.setItem(STORAGE_KEY, String(value));
    } catch {
      /* ignore persistence failures */
    }
  }, []);

  const toggleCollapsed = useCallback(() => {
    setCollapsedState((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(STORAGE_KEY, String(next));
      } catch {
        /* ignore persistence failures */
      }
      return next;
    });
  }, []);

  return (
    <SidebarCollapseContext.Provider value={{ collapsed, toggleCollapsed, setCollapsed }}>
      {children}
    </SidebarCollapseContext.Provider>
  );
}

export function useSidebarCollapse() {
  const ctx = useContext(SidebarCollapseContext);
  if (!ctx) {
    throw new Error('useSidebarCollapse must be used within a SidebarCollapseProvider');
  }
  return ctx;
}
