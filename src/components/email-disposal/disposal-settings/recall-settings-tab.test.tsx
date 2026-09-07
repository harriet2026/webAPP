import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { DisposalSettings } from '@/types/disposal-settings';
import { defaultDisposalSettings, disposalSettingsSchema } from './schema';
import { RecallSettingsTab } from './recall-settings-tab';

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}));

const { mockApiRequest, toastError } = vi.hoisted(() => ({
  mockApiRequest: vi.fn(),
  toastError: vi.fn(),
}));

vi.mock("@/lib/api/client", () => ({
  useApiRequest: () => ({ apiRequest: mockApiRequest }),
}));

vi.mock("@/lib/api/use-api-error-message", () => ({
  useApiErrorMessage: () => () => "密钥 ID 已存在，请更换后重试",
}));

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: toastError },
}));

function FormHarness({
  tenantId,
  queryClient,
}: {
  tenantId: number | null;
  queryClient: QueryClient;
}) {
  const form = useForm<DisposalSettings>({
    defaultValues: defaultDisposalSettings(),
  });
  return (
    <QueryClientProvider client={queryClient}>
      <RecallSettingsTab
        control={form.control}
        watch={form.watch}
        setValue={form.setValue}
        effectiveTenantId={tenantId}
      />
    </QueryClientProvider>
  );
}

function renderTab(effectiveTenantId: number | null = null) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const rendered = render(
    <FormHarness tenantId={effectiveTenantId} queryClient={queryClient} />,
  );
  return {
    ...rendered,
    rerenderTenant: (tenantId: number | null) =>
      rendered.rerender(
        <FormHarness tenantId={tenantId} queryClient={queryClient} />,
      ),
  };
}

beforeEach(() => {
  toastError.mockReset();
  mockApiRequest.mockReset();
  mockApiRequest.mockResolvedValue({ items: [] });
});

describe("GT-13308 RecallSettingsTab 召回密钥权限可见性", () => {
  it("租户管理员显示并加载本租户的召回密钥", async () => {
    renderTab(485);

    expect(
      screen.getByTestId("disposal-settings-recall-keys"),
    ).toBeInTheDocument();
    await waitFor(() =>
      expect(mockApiRequest).toHaveBeenCalledWith("/recall-keys"),
    );
  });

  it("系统管理员保留密钥列表与管理入口，并显示后端脱敏值", async () => {
    mockApiRequest.mockResolvedValue({
      items: [
        {
          id: 7,
          key_id: "coremail-agent",
          key_secret: "****masked****",
          is_active: 1,
          backend: "coremail",
          created_at: "2026-09-02T00:00:00Z",
          updated_at: "2026-09-02T00:00:00Z",
        },
      ],
    });

    renderTab(832);

    expect(
      screen.getByTestId("disposal-settings-recall-keys"),
    ).toBeInTheDocument();
    expect(
      screen.getByTestId("disposal-settings-recall-key-new"),
    ).toBeInTheDocument();
    expect(
      await screen.findByTestId("disposal-settings-recall-key-row-7"),
    ).toBeInTheDocument();
    expect(screen.getByText("****masked****")).toBeInTheDocument();
    expect(
      screen.getByTestId("disposal-settings-recall-key-delete-7"),
    ).toBeInTheDocument();
    expect(mockApiRequest).toHaveBeenCalledWith("/recall-keys");
  });

  it("系统管理员切换租户时重新加载召回密钥，不复用上一租户缓存", async () => {
    mockApiRequest
      .mockResolvedValueOnce({
        items: [
          {
            id: 485,
            key_id: "tenant-a",
            key_secret: "****",
            is_active: 1,
            backend: "coremail",
          },
        ],
      })
      .mockResolvedValueOnce({
        items: [
          {
            id: 832,
            key_id: "tenant-b",
            key_secret: "****",
            is_active: 1,
            backend: "exchange",
          },
        ],
      });

    const view = renderTab(485);
    expect(
      await screen.findByTestId("disposal-settings-recall-key-row-485"),
    ).toBeInTheDocument();

    view.rerenderTenant(832);
    expect(
      await screen.findByTestId("disposal-settings-recall-key-row-832"),
    ).toBeInTheDocument();
    expect(mockApiRequest).toHaveBeenCalledTimes(2);
  });
});

describe("RecallSettingsTab recall key errors (GT-13249)", () => {
  const actionableError = "密钥 ID 已存在，请更换后重试";

  it("shows the localized actionable API error instead of the generic create failure", async () => {
    mockApiRequest.mockImplementation(
      (path: string, options?: { method?: string }) => {
        if (path === "/recall-keys" && (options?.method ?? "GET") === "GET") {
          return Promise.resolve({ items: [] });
        }
        if (path === "/recall-keys" && options?.method === "POST") {
          return Promise.reject(new Error("conflict"));
        }
        return Promise.resolve({});
      },
    );
    const user = userEvent.setup();
    renderTab();

    await user.click(screen.getByTestId("disposal-settings-recall-key-new"));
    await user.type(screen.getByPlaceholderText("keyIdPlaceholder"), "aaa");
    await user.type(
      screen.getByPlaceholderText("keySecretPlaceholder"),
      "secret",
    );
    await user.click(screen.getByRole("button", { name: "create" }));

    await waitFor(() =>
      expect(toastError).toHaveBeenCalledWith(actionableError),
    );
    expect(toastError).not.toHaveBeenCalledWith("keyCreateFailed");
  });
});

describe("RecallSettingsTab timeout input (GT-13250)", () => {
  it("removes the forced zero before accepting a replacement integer", async () => {
    const user = userEvent.setup();
    renderTab();
    const timeout = screen.getByTestId("disposal-settings-recall-timeout");

    await user.clear(timeout);
    expect(timeout).toHaveValue(0);

    // Chromium can preserve the number input's lexical form while React Hook
    // Form already stores the parsed numeric value. Reproduce that browser
    // event shape directly: the field must canonicalize 031 back to 31.
    fireEvent.change(timeout, { target: { value: "031" } });

    expect(timeout).toHaveValue(31);
    expect((timeout as HTMLInputElement).value).toBe("31");
  });

  it('shows the 1-300 range error after a save attempt', async () => {
    function ValidatingHarness() {
      const defaults = defaultDisposalSettings();
      defaults.quarantine.portal_base_url = 'https://mail.example.test';
      const form = useForm<DisposalSettings>({
        defaultValues: defaults,
        resolver: zodResolver(disposalSettingsSchema),
      });
      return (
        <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
          <form noValidate onSubmit={form.handleSubmit(vi.fn())}>
            <RecallSettingsTab
              control={form.control}
              watch={form.watch}
              setValue={form.setValue}
              effectiveTenantId={null}
            />
            <button type="submit" data-testid="validation-save">save</button>
          </form>
        </QueryClientProvider>
      );
    }

    render(<ValidatingHarness />);
    await userEvent.clear(screen.getByTestId('disposal-settings-recall-timeout'));
    await userEvent.click(screen.getByTestId('validation-save'));

    expect(await screen.findByTestId('disposal-settings-recall-timeout-error')).toHaveTextContent(
      'recallTaskTimeoutRange',
    );
  });
});
