'use client';

import { useState } from 'react';
import { cn } from '@/lib/utils';
import { SidebarNav } from './sidebar-nav';
import { Header } from './header';
import { ImpersonationBanner } from './impersonation-banner';
import {
  SidebarCollapseProvider,
  useSidebarCollapse,
} from '@/contexts/sidebar-collapse-context';

interface AppShellProps {
  children: React.ReactNode;
}

function AppShellInner({ children }: AppShellProps) {
  // Collapsible sidebar shell: persistent collapse + transient hover-peek.
  const { collapsed } = useSidebarCollapse();
  // Transient hover-peek: only meaningful while collapsed. Kept local so a
  // hover never re-renders the header or page content (children is a stable
  // element reference, so React bails out of re-rendering it here).
  const [isPeeking, setIsPeeking] = useState(false);

  // The rail shows full labels when the user hasn't collapsed it, or while
  // peeking out on hover.
  const showExpanded = !collapsed || isPeeking;

  return (
    <div className="flex h-dvh overflow-hidden bg-background">
      {/* Occupier: reserves layout width. Peek does NOT change this, so the
          flyout floats over content instead of pushing it. */}
      <aside
        className={cn(
          'hidden shrink-0 md:block transition-[width] duration-300 ease-out motion-reduce:transition-none',
          collapsed ? 'w-16' : 'w-64',
        )}
        data-testid="app-sidebar-slot"
        data-collapsed={collapsed ? 'true' : undefined}
      >
        {/* Visual rail: pinned to the left edge. Widens to full on peek and
            floats above content (z-30 > header z-20). */}
        <div
          className={cn(
            'fixed inset-y-0 left-0 z-30 overflow-hidden bg-sidebar',
            'transition-[width,box-shadow] duration-300 ease-out motion-reduce:transition-none',
            showExpanded ? 'w-64' : 'w-16',
            collapsed && isPeeking && 'shadow-2xl',
          )}
          data-peeking={collapsed && isPeeking ? 'true' : undefined}
          onPointerEnter={(e) => {
            if (collapsed && (e.pointerType === 'mouse' || e.pointerType === 'pen')) {
              setIsPeeking(true);
            }
          }}
          onPointerLeave={() => setIsPeeking(false)}
        >
          <SidebarNav collapsed={collapsed} showExpanded={showExpanded} />
        </div>
      </aside>

      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <Header />
        <ImpersonationBanner />
        <main className="min-h-0 flex-1 overflow-y-auto" data-testid="app-main-scroll">
          <div
            className="min-h-full bg-background p-8 has-[[data-layout=framed]]:bg-gray-50 dark:has-[[data-layout=framed]]:bg-gray-950"
            data-testid="app-page-viewport"
          >
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}

export function AppShell({ children }: AppShellProps) {
  return (
    <SidebarCollapseProvider>
      <AppShellInner>{children}</AppShellInner>
    </SidebarCollapseProvider>
  );
}
