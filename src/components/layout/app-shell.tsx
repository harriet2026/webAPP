'use client';

import { SidebarNav } from './sidebar-nav';
import { Header } from './header';
import { ImpersonationBanner } from './impersonation-banner';
import { UnsavedGuardProvider } from '@/contexts/unsaved-guard-context';
import { UnsavedGuardDialog } from './unsaved-guard-dialog';

interface AppShellProps {
  children: React.ReactNode;
}

export function AppShell({ children }: AppShellProps) {
  return (
    <UnsavedGuardProvider>
      <div className="flex h-dvh overflow-hidden bg-background">
        <aside className="hidden w-64 shrink-0 md:block" data-testid="app-sidebar-slot">
          <div className="fixed inset-y-0 left-0 w-64 overflow-hidden bg-sidebar">
            <SidebarNav />
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
      <UnsavedGuardDialog />
    </UnsavedGuardProvider>
  );
}
