import { test, expect } from "../fixtures/auth.fixture";
import { MailRoutingPage, TABS } from "../pages/mail-routing.page";

// GT-12235: SPF-authorized relay grants are determined by the sender domain's
// DNS, bypassing the trusted relay IP pool, so any SPF grant is inherently
// privileged — only a system admin may create one. This spec pins the
// system-admin UI half: the SPF toggle is visible and enabled, toggling it
// surfaces the privileged-grant notice, the SPF/any-sender pair is mutually
// exclusive, the add-relay-rule dialog carries the scope-notice that
// disambiguates "who may relay" from "what gets scanned", and the create-flow
// test pins the full pure-SPF path: CIDR gating, list badge, "—" placeholder.
//
// Every test goes through the tenant drill-down: on multi-tenant forms (the
// dev stack) the standalone /zh/mail-routing page deliberately redirects to
// the tenant center (spec §3.2 / GT-12330), so a goto() there never renders
// the shell — the earlier standalone-page version of these tests could only
// time out on this form.

// Seeding goes to the apiserver directly (ABSOLUTE url — the webapp origin 301s
// http→https which downgrades POST to GET, see webapp/AGENTS.md).
const API_BASE = process.env.PLAYWRIGHT_API_BASE_URL || "http://localhost:18080";

async function adminToken(): Promise<string> {
  const r = await fetch(`${API_BASE}/api/v1/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username: "admin", password: "admin123" }),
  });
  if (!r.ok) throw new Error(`admin login failed: ${r.status}`);
  return (await r.json()).token;
}

async function api(token: string, path: string, init?: RequestInit) {
  return fetch(`${API_BASE}/api/v1${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
}

test.describe("Relay grant SPF (GT-12235)", () => {
  const suffix = Date.now().toString(36);
  const code = `gt12235spf${suffix}`;
  const name = `gt12235_spf_${suffix}`;
  const domainName = `${code}.test.local`;
  let tenantId: number | null = null;

  test.beforeAll(async () => {
    const token = await adminToken();
    const created = await api(token, "/tenants", {
      method: "POST",
      body: JSON.stringify({
        name,
        code,
        domains: [
          {
            domain: domainName,
            next_hop_type: "domain",
            next_hop_host: "smtpsink",
            next_hop_port: 25,
          },
        ],
      }),
    });
    expect(created.status, "create tenant").toBe(201);
    tenantId = (await created.json()).tenant.id as number;

    // Grants may only name a VERIFIED domain; manual verify is the
    // platform-admin fallback in dev (no real DNS TXT record).
    const domainsResp = await api(token, `/tenants/${tenantId}/domains`, {
      headers: { "X-Tenant-ID": String(tenantId) },
    });
    const domainId = (await domainsResp.json()).items[0].id as number;
    const verified = await api(
      token,
      `/tenants/${tenantId}/domains/${domainId}/verify/manual`,
      {
        method: "POST",
        headers: { "X-Tenant-ID": String(tenantId) },
        body: JSON.stringify({}),
      },
    );
    expect(verified.status, "manual verify domain").toBe(200);

    // Activate: new tenants land pending, and a pending tenant breaks the
    // multi-tenant selector (see project memory: default tenant pending).
    const activated = await api(token, `/tenants/${tenantId}/status`, {
      method: "PUT",
      body: JSON.stringify({ status: "active" }),
    });
    expect([200, 204], "activate tenant").toContain(activated.status);
    // ok() is not enough on its own — read the status back so a silently
    // dropped write (the 301-downgrade class of bug) cannot pass.
    const check = await api(token, `/tenants/${tenantId}`);
    expect((await check.json()).status, "tenant is active").toBe("active");
  });

  test.afterAll(async () => {
    if (tenantId === null) return;
    const token = await adminToken();
    await api(token, `/tenants/${tenantId}`, { method: "DELETE" });
  });

  /** Drill into the seeded tenant's routing shell and open the relay tab. */
  async function openRelayTab(page: MailRoutingPage) {
    await page.openViaTenantDrilldown(name);
    await page.openTab(TABS.relay);
  }

  /** Open the add-grant dialog. The "新增授权" button is rendered by
   * RelayGrantsCard (mailRouting.relayGrants.add); MailRoutingPage.openAddRelay
   * targets the relay-RULE dialog, so click the grants button directly. */
  async function openAddGrantDialog(page: MailRoutingPage) {
    await page.page.getByRole("button", { name: "新增授权" }).click();
    await page.dialog.waitFor({ state: "visible" });
  }

  test("system admin sees an enabled SPF toggle and the privileged notice", async ({
    authenticatedPage,
  }) => {
    const page = new MailRoutingPage(authenticatedPage);
    await openRelayTab(page);
    await openAddGrantDialog(page);

    const spfToggle = page.dialog.getByTestId("relay-use-spf");
    await expect(spfToggle).toBeVisible();
    // data-disabled is absent when the switch is enabled (shadcn convention).
    await expect(spfToggle).not.toHaveAttribute("data-disabled", "");

    // Toggling SPF on must surface the privileged-grant notice so the operator
    // cannot believe they just built an ordinary grant.
    await spfToggle.dispatchEvent("click");
    await expect(
      page.dialog.getByTestId("relay-use-spf-privileged-notice"),
    ).toBeVisible();
  });

  test("add-relay-rule dialog shows the scope notice clarifying grants vs rules", async ({
    authenticatedPage,
  }) => {
    const page = new MailRoutingPage(authenticatedPage);
    await openRelayTab(page);

    await page.openAddRelay();
    await expect(
      authenticatedPage.getByTestId("relay-rules-scope-notice"),
    ).toBeVisible();
  });

  test("rules section shows a persistent scope banner and an unambiguous button label", async ({
    authenticatedPage,
  }) => {
    const page = new MailRoutingPage(authenticatedPage);
    await openRelayTab(page);

    // The banner must be visible WITHOUT opening any dialog — the dialog-only
    // notice fires after the operator already picked the wrong entry point.
    await expect(
      authenticatedPage.getByTestId("relay-rules-scope-banner"),
    ).toBeVisible();
    // The button says "anti-spam exception", not "转发规则", so it cannot be
    // mistaken for the relay-authorization entry point.
    await expect(
      authenticatedPage.getByRole("button", { name: "添加反垃圾例外规则" }),
    ).toBeVisible();
  });

  test("edits an existing CIDR grant in place to a pure-SPF grant (id survives)", async ({
    authenticatedPage,
  }) => {
    // Seed a plain CIDR grant via the API (privileged so the public /32 needs
    // no trusted-pool membership).
    const token = await adminToken();
    const domainsResp = await api(token, `/tenants/${tenantId}/domains`, {
      headers: { "X-Tenant-ID": String(tenantId) },
    });
    const domainId = (await domainsResp.json()).items[0].id as number;
    const created = await api(token, "/relay-grants", {
      method: "POST",
      headers: { "X-Tenant-ID": String(tenantId) },
      body: JSON.stringify({
        tenant_domain_id: domainId,
        client_cidr: "203.0.113.99/32",
        privileged: true,
        note: `edit-in-place ${suffix}`,
      }),
    });
    expect(created.status, "seed CIDR grant").toBe(201);
    const grantId = (await created.json()).id as number;

    const page = new MailRoutingPage(authenticatedPage);
    await openRelayTab(page);

    // Edit the seeded row: enable SPF, clear the CIDR, save.
    const row = authenticatedPage.getByTestId(`relay-grant-${grantId}`);
    await expect(row).toBeVisible();
    await row.getByTestId("relay-grant-edit").click();
    await page.dialog.waitFor({ state: "visible" });
    const cidrInput = page.dialog.locator("#relay-cidr");
    await expect(cidrInput).toHaveValue("203.0.113.99/32");
    await page.dialog.getByTestId("relay-use-spf").dispatchEvent("click");
    await cidrInput.fill("");
    await page.dialog.getByRole("button", { name: "保存" }).click();
    await page.dialog.waitFor({ state: "hidden" });

    // Same row (same id — no delete+recreate): SPF badge + "—" CIDR echo.
    await expect(row.getByTestId("relay-grant-spf-badge")).toBeVisible();
    await expect(row).toContainText("—");

    // And the API agrees: the grant kept its id and became pure-SPF.
    const after = await api(token, "/relay-grants", {
      headers: { "X-Tenant-ID": String(tenantId) },
    });
    const items = (await after.json()).items as Array<{
      id: number;
      use_spf: boolean;
      client_cidr: string;
    }>;
    const g = items.find((i) => i.id === grantId);
    expect(g, "grant id survived the edit").toBeDefined();
    expect(g!.use_spf).toBe(true);
    expect(g!.client_cidr).toBe("");

    // Clean up: the edited grant is now an identical pure-SPF grant to the one
    // the create-flow test builds for this domain — leaving it would 409 that
    // test's save with "An identical relay grant already exists".
    await api(token, `/relay-grants/${grantId}`, {
      method: "DELETE",
      headers: { "X-Tenant-ID": String(tenantId) },
    });
  });

  test("SPF and any-sender are mutually exclusive in the dialog", async ({
    authenticatedPage,
  }) => {
    const page = new MailRoutingPage(authenticatedPage);
    await openRelayTab(page);
    await openAddGrantDialog(page);

    // SPF on → the any-sender option must be disabled (no SPF record exists
    // for "any sender"; picking both used to dead-end on the API's 400).
    await page.dialog.getByTestId("relay-use-spf").dispatchEvent("click");
    await page.dialog.locator("#relay-domain").click();
    // Radix options portal to the body — locate at page level.
    const anyOption = authenticatedPage.getByRole("option", {
      name: "任意发信域",
    });
    await expect(anyOption).toHaveAttribute("data-disabled");
    await authenticatedPage.keyboard.press("Escape"); // close the listbox

    // SPF back off, pick any-sender → the SPF toggle disables in turn.
    await page.dialog.getByTestId("relay-use-spf").dispatchEvent("click");
    await page.dialog.locator("#relay-domain").click();
    await authenticatedPage.getByRole("option", { name: "任意发信域" }).click();
    await expect(page.dialog.getByTestId("relay-use-spf")).toHaveAttribute(
      "aria-disabled",
      "true",
    );
  });

  test("creates a pure-SPF grant: CIDR gate relaxes, badge and — placeholder render", async ({
    authenticatedPage,
  }) => {
    const page = new MailRoutingPage(authenticatedPage);
    await openRelayTab(page);
    await openAddGrantDialog(page);

    // Pick the verified domain (Radix portal: option lives on the page).
    await page.dialog.locator("#relay-domain").click();
    await authenticatedPage.getByRole("option", { name: domainName }).click();

    // CIDR empty + SPF off → save is gated; SPF on → the gate relaxes
    // (this is the review-T13 assertion, previously vacuous in unit form).
    const save = page.dialog.getByRole("button", { name: "保存" });
    await expect(save).toBeDisabled();
    await page.dialog.getByTestId("relay-use-spf").dispatchEvent("click");
    await expect(save).toBeEnabled();
    await save.click();

    // The new grant row renders the SPF badge and "—" for the empty CIDR.
    await page.dialog.waitFor({ state: "hidden" });
    const badge = authenticatedPage.getByTestId("relay-grant-spf-badge").first();
    await expect(badge).toBeVisible();
    const row = authenticatedPage
      .locator('[data-testid^="relay-grant-"]')
      .filter({ has: badge })
      .first();
    await expect(row).toContainText("—");
    await expect(row).toContainText(domainName);
  });
});
