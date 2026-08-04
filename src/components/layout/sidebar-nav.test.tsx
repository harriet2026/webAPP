import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Plan C Task 6 (spec §7.2): the sidebar must filter nav items by the
// current role's RBAC-derived `canSeeRoute`, while preserving the existing
// `requiresAdvancedRules` gate exactly (the two gates AND together — RBAC
// must never resurrect an advance-gated item), and collapsing any parent
// group whose children are all hidden.

let mockCanSeeRoute: (href: string) => boolean = () => true;
let mockIsSystemAdmin = true;
let mockShowAdvancedRules = true;
let mockSwitcherEnabled = true;

vi.mock('@/contexts/auth-context', () => ({
  useAuth: () => ({
    hasPermission: () => true,
    isSystemAdmin: mockIsSystemAdmin,
    showAdvancedRules: mockShowAdvancedRules,
    canSeeRoute: (href: string) => mockCanSeeRoute(href),
  }),
}));

vi.mock('@/contexts/product-form-context', () => ({
  // capabilities: null skips the form-visibility gate entirely (unrelated to this task).
  useProductForm: () => ({
    capabilities: null,
    registry: [],
    viewer: {},
    grants: [],
    switcherEnabled: mockSwitcherEnabled,
  }),
}));

vi.mock('@/i18n/navigation', () => ({
  usePathname: () => '/',
  useRouter: () => ({ push: vi.fn() }),
}));

vi.mock('next-intl', () => ({
  useTranslations: () => (k: string) => k,
}));

// VersionFooter (GT-11459) issues a react-query useQuery('/version'); it is
// orthogonal to these sidebar RBAC-filtering tests and, rendered bare, throws
// "No QueryClient set". Stub it out so the tests don't need a QueryClientProvider.
vi.mock('./version-footer', () => ({
  VersionFooter: () => null,
}));

import { SidebarNav } from './sidebar-nav';
import { UnsavedGuardProvider } from '../../contexts/unsaved-guard-context';

describe('SidebarNav RBAC filtering (Plan C Task 6, spec §7.2)', () => {
  beforeEach(() => {
    mockCanSeeRoute = () => true;
    mockIsSystemAdmin = true;
    mockShowAdvancedRules = true;
    mockSwitcherEnabled = true;
  });

  it('true super admin sees every group, including advance-gated and system/users', async () => {
    render(<UnsavedGuardProvider><SidebarNav /></UnsavedGuardProvider>);
    expect(screen.getByText('sidebar.systemStatus')).toBeInTheDocument(); // dashboard
    expect(screen.getByText('sidebar.advancedRules')).toBeInTheDocument();
    expect(screen.getByText('sidebar.system')).toBeInTheDocument();

    const user = userEvent.setup();
    await user.click(screen.getByText('sidebar.system'));
    expect(screen.getByText('sidebar.users')).toBeInTheDocument();
  });

  it('hides the entire logs group when the product-form switcher is disabled', () => {
    mockSwitcherEnabled = false;

    render(<UnsavedGuardProvider><SidebarNav /></UnsavedGuardProvider>);

    expect(screen.queryByText('sidebar.logs')).not.toBeInTheDocument();
    expect(screen.queryByText('sidebar.authAttempts')).not.toBeInTheDocument();
    expect(screen.queryByText('sidebar.adminAuditLogs')).not.toBeInTheDocument();
  });

  it('keeps the browser tab title aligned with the sidebar brand name', () => {
    render(<UnsavedGuardProvider><SidebarNav /></UnsavedGuardProvider>);
    const brandName = screen.getByText('branding.selfHostedName');

    expect(document.title).toBe(brandName.textContent);
  });

  it('provides pointer-driven hover feedback without relying on CSS hover media support', () => {
    render(<UnsavedGuardProvider><SidebarNav /></UnsavedGuardProvider>);
    const dashboardItem = screen.getByText('sidebar.systemStatus').closest('button');
    const dashboardIcon = dashboardItem?.querySelector('svg');
    const submenuItem = Array.from(document.querySelectorAll('button'))
      .find((button) => button.classList.contains('px-3'));

    expect(dashboardItem).not.toHaveAttribute('data-hovered');
    expect(dashboardItem).not.toHaveClass('bg-white/[0.07]');

    fireEvent.pointerEnter(dashboardItem!, { pointerType: 'mouse' });

    expect(dashboardItem).toHaveAttribute('data-hovered', 'true');
    expect(dashboardItem).toHaveClass(
      'transition-[background-color,color,box-shadow]',
      'bg-white/[0.07]',
      'shadow-[inset_0_0_0_1px_rgb(255_255_255/0.055)]',
      'duration-[240ms]',
    );
    expect(dashboardIcon).toHaveClass(
      'scale-[1.04]',
      'text-blue-300',
      'motion-reduce:scale-100',
    );

    fireEvent.pointerLeave(dashboardItem!);
    expect(dashboardItem).not.toHaveAttribute('data-hovered');
    expect(dashboardItem).not.toHaveClass('bg-white/[0.07]');

    fireEvent.pointerEnter(submenuItem!, { pointerType: 'mouse' });
    expect(submenuItem).toHaveClass(
      'bg-white/[0.05]',
      'shadow-[inset_0_0_0_1px_rgb(255_255_255/0.055)]',
    );
  });

  it('non-super role granting only the monitor-dashboard route shows dashboard but hides system/users entirely', () => {
    mockIsSystemAdmin = false;
    mockShowAdvancedRules = false;
    mockCanSeeRoute = (href) => href === '/dashboard';

    render(<UnsavedGuardProvider><SidebarNav /></UnsavedGuardProvider>);
    expect(screen.getByText('sidebar.systemStatus')).toBeInTheDocument(); // dashboard visible
    // system group's every child href is denied -> the whole group collapses (empty-parent hide).
    expect(screen.queryByText('sidebar.system')).not.toBeInTheDocument();
  });

  it('advance-gated groups stay hidden for a non-super even when RBAC canSeeRoute grants their routes (AND of both gates)', () => {
    mockIsSystemAdmin = false;
    mockShowAdvancedRules = false;
    mockCanSeeRoute = () => true; // RBAC grants everything

    render(<UnsavedGuardProvider><SidebarNav /></UnsavedGuardProvider>);
    expect(screen.queryByText('sidebar.advancedRules')).not.toBeInTheDocument();
    expect(screen.queryByText('sidebar.mail')).not.toBeInTheDocument(); // also requiresAdvancedRules
  });

  it('a parent group whose children are all denied by RBAC is not rendered (empty-group hide)', () => {
    mockIsSystemAdmin = true;
    mockShowAdvancedRules = true;
    mockCanSeeRoute = (href) => href === '/dashboard';

    render(<UnsavedGuardProvider><SidebarNav /></UnsavedGuardProvider>);
    expect(screen.queryByText('sidebar.monitoringCenter')).not.toBeInTheDocument();
    expect(screen.queryByText('sidebar.statistics')).not.toBeInTheDocument();
  });
});
