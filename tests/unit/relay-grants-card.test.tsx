import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createElement } from "react";

// GT-12235: SPF-authorized grants are determined by the sender domain's DNS,
// which bypasses the trusted-relay IP pool, so any SPF grant is inherently
// privileged — a tenant admin must NOT be able to self-serve one. The card
// has to make that obvious instead of letting an operator believe they just
// created an ordinary grant.
//
// Role differentiation here is driven by the relay policy's `can_privilege`
// flag (the SAME gate the card already uses for the master switch / "any
// sender domain" option), NOT by a hasPermission mock that returns true for
// everything. That keeps the real permission matrix in the loop.

const apiRequestMock = vi.fn();

vi.mock("@/lib/api/client", () => ({
  useApiRequest: () => ({ apiRequest: apiRequestMock }),
  useScopedApiRequest: () => ({ apiRequest: apiRequestMock }),
  apiRequest: (...args: unknown[]) => apiRequestMock(...args),
}));

vi.mock("next-intl", () => ({
  useTranslations:
    (_ns?: string) =>
    (key: string, params?: Record<string, string | number>) => {
      void _ns;
      if (params) {
        return Object.entries(params).reduce(
          (s, [k, v]) => s.replace(`{${k}}`, String(v)),
          key,
        );
      }
      return key;
    },
}));

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() },
}));

// Per-test tenant-domain fixture: tests that drive the sender-domain select set
// this; the default keeps the historical "no domains" behavior.
let tenantDomainsFixture: Array<Record<string, unknown>> = [];
vi.mock("@/lib/api/tenants", () => ({
  getTenantDomains: () => Promise.resolve(tenantDomainsFixture),
}));

import { RelayGrantsCard } from "@/components/mail-routing/relay-grants-card";

function policyPayload(over: Record<string, unknown> = {}) {
  return {
    enabled: true,
    trusted_cidrs: ["192.168.0.0/16"],
    min_prefix_len_v4: 24,
    min_prefix_len_v6: 64,
    can_privilege: true,
    ...over,
  };
}

// Per-test grants fixture: tests that drive the row edit button set this; the
// default keeps the historical "no grants" behavior.
let grantsFixture: Array<Record<string, unknown>> = [];

function routeApi(policy: Record<string, unknown>) {
  apiRequestMock.mockImplementation(
    (
      url: string,
      opts?: { method?: string; body?: Record<string, unknown> },
    ) => {
      if (url === "/relay-grants/_meta/policy") {
        if (opts?.method === "PUT") {
          return Promise.resolve(
            policyPayload({
              ...policy,
              enabled: (opts.body as { enabled?: boolean }).enabled,
            }),
          );
        }
        return Promise.resolve(policy);
      }
      if (url === "/relay-grants")
        return Promise.resolve({ items: grantsFixture });
      return Promise.resolve({});
    },
  );
}

function renderCard(opts: { role: "system_admin" | "tenant_admin" }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const user = userEvent.setup();
  routeApi(policyPayload({ can_privilege: opts.role === "system_admin" }));
  const utils = render(
    createElement(
      QueryClientProvider,
      { client: qc },
      createElement(RelayGrantsCard, { tenantId: 1 }),
    ),
  );
  return { user, ...utils };
}

const verifiedDomainFixture = [
  {
    id: 10,
    tenant_id: 1,
    domain: "163host.com",
    verify_status: "verified",
    is_active: true,
  },
];

/** The body of the (single) POST /relay-grants call, or undefined. */
function postedGrantBody(): Record<string, unknown> | undefined {
  const call = apiRequestMock.mock.calls.find(
    ([url, opts]) =>
      url === "/relay-grants" &&
      (opts as { method?: string } | undefined)?.method === "POST",
  );
  return call?.[1]?.body as Record<string, unknown> | undefined;
}

describe("RelayGrantsCard use_spf (GT-12235)", () => {
  beforeEach(() => {
    apiRequestMock.mockReset();
    tenantDomainsFixture = [];
    grantsFixture = [];
  });

  it("系统管理员可见且可用「使用发信域 SPF 记录」开关", async () => {
    renderCard({ role: "system_admin" });
    // Open the add-grant dialog — the SPF toggle lives inside it.
    (await screen.findByRole("button", { name: "add" })).click();
    const toggle = await screen.findByTestId("relay-use-spf");
    // shadcn Switch is a span; when enabled there is no data-disabled attr.
    expect(toggle.getAttribute("data-disabled")).toBeNull();
  });

  it("租户管理员看到禁用态", async () => {
    renderCard({ role: "tenant_admin" });
    (await screen.findByRole("button", { name: "add" })).click();
    const toggle = await screen.findByTestId("relay-use-spf");
    // shadcn Switch is a span with aria-disabled (no native disabled attr),
    // mirroring the master-switch test's aria-checked convention.
    expect(toggle.getAttribute("aria-disabled")).toBe("true");
  });

  it("勾选后来源 IP 不再必填，且明示这是特权授权", async () => {
    tenantDomainsFixture = verifiedDomainFixture;
    const { user } = renderCard({ role: "system_admin" });
    (await screen.findByRole("button", { name: "add" })).click();

    // Pick a concrete sender domain so the save gate is decided by the CIDR
    // requirement alone.
    await user.click(await screen.findByRole("combobox"));
    await user.click(await screen.findByRole("option", { name: "163host.com" }));

    // CIDR empty + SPF off → the save button must be gated (this is the real
    // assertion behind "client IP required"; the previous version asserted a
    // text the component never renders, which passed even with the gate gone).
    const save = screen.getByRole("button", { name: "save" });
    expect(save).toBeDisabled();

    const toggle = screen.getByTestId("relay-use-spf");
    await user.click(toggle);

    // The privileged-grant notice must surface so an operator cannot think
    // they just built an ordinary grant.
    await waitFor(() => {
      expect(
        screen.getByTestId("relay-use-spf-privileged-notice"),
      ).toBeInTheDocument();
    });
    // The "client IP required" gate must be relaxed once SPF is on.
    await waitFor(() => expect(save).toBeEnabled());
  });

  it("勾选 SPF 后「任意发信域」选项禁用；先选任意发信域则 SPF 开关禁用（互斥）", async () => {
    tenantDomainsFixture = verifiedDomainFixture;
    const { user } = renderCard({ role: "system_admin" });
    (await screen.findByRole("button", { name: "add" })).click();

    // Direction 1: SPF on → the any-sender option is disabled.
    await user.click(await screen.findByTestId("relay-use-spf"));
    await user.click(await screen.findByRole("combobox"));
    const anyOption = await screen.findByRole("option", { name: "anySender" });
    expect(anyOption).toHaveAttribute("data-disabled");
    // Close the listbox by choosing the concrete domain.
    await user.click(screen.getByRole("option", { name: "163host.com" }));

    // Direction 2: any-sender selected (SPF off) → the SPF toggle is disabled.
    await user.click(screen.getByTestId("relay-use-spf")); // SPF back off
    await user.click(screen.getByRole("combobox"));
    await user.click(await screen.findByRole("option", { name: "anySender" }));
    await waitFor(() => {
      expect(
        screen.getByTestId("relay-use-spf").getAttribute("aria-disabled"),
      ).toBe("true");
    });
  });

  it("SPF 勾了又关不残留特权：提交的 grant privileged=false（B1 粘滞回归）", async () => {
    tenantDomainsFixture = verifiedDomainFixture;
    const { user } = renderCard({ role: "system_admin" });
    (await screen.findByRole("button", { name: "add" })).click();

    await user.click(await screen.findByRole("combobox"));
    await user.click(await screen.findByRole("option", { name: "163host.com" }));

    const toggle = screen.getByTestId("relay-use-spf");
    await user.click(toggle); // on…
    await user.click(toggle); // …and off again

    await user.type(screen.getByLabelText("clientCidr"), "192.168.201.86/32");
    await user.click(screen.getByRole("button", { name: "save" }));

    await waitFor(() => expect(postedGrantBody()).toBeDefined());
    const body = postedGrantBody()!;
    expect(body.use_spf).toBe(false);
    // The whole point: un-toggling SPF must not leave a quietly-privileged
    // ordinary grant behind.
    expect(body.privileged).toBe(false);
  });

  it("来源 IP 为空时空发件人开关禁用；清空 IP 会自动收回该标志（U1 联动）", async () => {
    tenantDomainsFixture = verifiedDomainFixture;
    const { user } = renderCard({ role: "system_admin" });
    (await screen.findByRole("button", { name: "add" })).click();
    await screen.findByRole("combobox");

    const nullSender = screen.getByRole("switch", { name: "allowNullSender" });
    // Empty CIDR → the switch is disabled (a null-sender grant matches by IP
    // alone; the API rejects the combination with 400).
    expect(nullSender.getAttribute("aria-disabled")).toBe("true");

    const cidr = screen.getByLabelText("clientCidr");
    await user.type(cidr, "192.168.201.86/32");
    await waitFor(() =>
      expect(nullSender.getAttribute("aria-disabled")).not.toBe("true"),
    );
    await user.click(nullSender);
    expect(nullSender.getAttribute("aria-checked")).toBe("true");

    // Clearing the CIDR must drop the flag instead of freezing an invalid
    // hidden combination behind a disabled switch.
    await user.clear(cidr);
    await waitFor(() =>
      expect(nullSender.getAttribute("aria-checked")).toBe("false"),
    );
  });
});

/** The body of the (single) PUT /relay-grants/:id call, or undefined. */
function putGrantBody(id: number): Record<string, unknown> | undefined {
  const call = apiRequestMock.mock.calls.find(
    ([url, opts]) =>
      url === `/relay-grants/${id}` &&
      (opts as { method?: string } | undefined)?.method === "PUT",
  );
  return call?.[1]?.body as Record<string, unknown> | undefined;
}

const cidrGrantFixture = {
  id: 77,
  tenant_id: 1,
  tenant_domain_id: 10,
  client_cidr: "192.168.201.0/24",
  use_spf: false,
  privileged: false,
  allow_null_sender: false,
  skip_antispam: true,
  rate_limit_per_hour: 200,
  is_active: true,
  expires_at: "2030-01-01T00:00:00Z",
  note: "customer A",
  sender_domain: "163host.com",
  created_at: "",
  updated_at: "",
};

describe("RelayGrantsCard edit-in-place (review: no edit entry)", () => {
  beforeEach(() => {
    apiRequestMock.mockReset();
    tenantDomainsFixture = verifiedDomainFixture;
    grantsFixture = [cidrGrantFixture];
  });

  it("编辑既有 CIDR 授权原地开启 SPF 并清空 CIDR：走 PUT，保留 is_active/expires_at", async () => {
    const { user } = renderCard({ role: "system_admin" });

    await user.click(await screen.findByTestId("relay-grant-edit"));

    // The dialog is pre-filled from the row.
    const cidr = screen.getByLabelText("clientCidr") as HTMLInputElement;
    expect(cidr.value).toBe("192.168.201.0/24");

    // Turn the grant into a pure-SPF one.
    await user.click(screen.getByTestId("relay-use-spf"));
    await user.clear(cidr);
    await user.click(screen.getByRole("button", { name: "save" }));

    await waitFor(() => expect(putGrantBody(77)).toBeDefined());
    const body = putGrantBody(77)!;
    expect(body.use_spf).toBe(true);
    expect(body.client_cidr).toBe("");
    expect(body.privileged).toBe(true);
    // PUT is a full update — omitting these would silently clear the expiry
    // and re-activate a disabled grant.
    expect(body.is_active).toBe(true);
    expect(body.expires_at).toBe("2030-01-01T00:00:00Z");
    // No delete+recreate: the grant id survives.
    expect(postedGrantBody()).toBeUndefined();
  });

  it("编辑弹窗预填 skip_antispam / 限速 / 备注", async () => {
    const { user } = renderCard({ role: "system_admin" });
    await user.click(await screen.findByTestId("relay-grant-edit"));

    expect(
      screen
        .getByRole("switch", { name: "skipAntispam" })
        .getAttribute("aria-checked"),
    ).toBe("true");
    expect((screen.getByLabelText("rateLimit") as HTMLInputElement).value).toBe(
      "200",
    );
    expect((screen.getByLabelText("note") as HTMLInputElement).value).toBe(
      "customer A",
    );
  });
});

describe("RelayGrantsCard privileged toggle (review: out-of-pool grant unreachable)", () => {
  beforeEach(() => {
    apiRequestMock.mockReset();
    tenantDomainsFixture = verifiedDomainFixture;
    grantsFixture = [];
  });

  it("系统管理员：具体发信域 + 外部 CIDR + 不开 SPF + 勾特权 → POST privileged:true", async () => {
    const { user } = renderCard({ role: "system_admin" });
    (await screen.findByRole("button", { name: "add" })).click();

    await user.click(await screen.findByRole("combobox"));
    await user.click(await screen.findByRole("option", { name: "163host.com" }));
    // A public /32 outside the trusted pool (192.168.0.0/16 in the fixture).
    await user.type(screen.getByLabelText("clientCidr"), "203.0.113.7/32");
    await user.click(screen.getByTestId("relay-privileged"));
    await user.click(screen.getByRole("button", { name: "save" }));

    await waitFor(() => expect(postedGrantBody()).toBeDefined());
    const body = postedGrantBody()!;
    expect(body.privileged).toBe(true);
    expect(body.use_spf).toBe(false);
  });

  it("勾选 SPF 时特权开关强制开启且锁定；取消 SPF 回落到手动值", async () => {
    const { user } = renderCard({ role: "system_admin" });
    (await screen.findByRole("button", { name: "add" })).click();

    await user.click(await screen.findByRole("combobox"));
    await user.click(await screen.findByRole("option", { name: "163host.com" }));

    const privToggle = screen.getByTestId("relay-privileged");
    expect(privToggle.getAttribute("aria-checked")).toBe("false");

    await user.click(screen.getByTestId("relay-use-spf"));
    await waitFor(() => {
      expect(privToggle.getAttribute("aria-checked")).toBe("true");
      expect(privToggle.getAttribute("aria-disabled")).toBe("true");
      expect(
        screen.getByTestId("relay-privileged-forced-notice"),
      ).toBeInTheDocument();
    });

    // Un-toggling SPF drops the forced contribution (GT-12235 invariant).
    await user.click(screen.getByTestId("relay-use-spf"));
    await waitFor(() => {
      expect(privToggle.getAttribute("aria-checked")).toBe("false");
      expect(privToggle.getAttribute("aria-disabled")).not.toBe("true");
    });
  });

  it("租户管理员看不到特权开关", async () => {
    renderCard({ role: "tenant_admin" });
    (await screen.findByRole("button", { name: "add" })).click();
    await screen.findByTestId("relay-use-spf");
    expect(screen.queryByTestId("relay-privileged")).toBeNull();
  });
});
