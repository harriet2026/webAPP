import { test, expect } from "../fixtures/auth.fixture";
import { seedMailLogs } from "../helpers/seed-data";
import { waitForDataRow, ensureFiltersExpanded } from "../helpers/mail-list";

test.describe("Email Disposal Center", () => {
  test.beforeAll(async ({ request }) => {
    await seedMailLogs(request);
  });

  test.beforeEach(async ({ authenticatedPage }) => {
    await authenticatedPage.goto("/zh/email-disposal/center");
    await authenticatedPage.waitForLoadState("networkidle");
    await authenticatedPage.waitForTimeout(1500);
  });

  test("page loads with data table", async ({ authenticatedPage }) => {
    const heading = authenticatedPage.locator("main h1");
    await expect(heading).toBeVisible({ timeout: 10000 });
    const table = authenticatedPage.locator("table").first();
    await expect(table).toBeVisible({ timeout: 10000 });
  });

  test("quick filter section visible", async ({ authenticatedPage }) => {
    // 结构化筛选采用渐进披露；需要使用时由 helper 幂等展开。
    await ensureFiltersExpanded(authenticatedPage);
    await expect(
      authenticatedPage.getByText("收发时间", { exact: true }).first(),
    ).toBeVisible({ timeout: 10000 });
  });

  test("search input visible", async ({ authenticatedPage }) => {
    const input = authenticatedPage.locator(
      'input[placeholder*="描述邮件特征"]',
    );
    if ((await input.count()) === 0) {
      const altInput = authenticatedPage.locator('input[placeholder*="邮件"]');
      await expect(altInput).toBeVisible({ timeout: 10000 });
      return;
    }
    await expect(input).toBeVisible({ timeout: 10000 });
  });

  test("advanced filters toggle", async ({ authenticatedPage }) => {
    // 「更多筛选条件」位于按需展开的结构化筛选区内。
    await ensureFiltersExpanded(authenticatedPage);
    await expect(authenticatedPage.locator("text=更多筛选条件")).toBeVisible({
      timeout: 10000,
    });
  });

  test("detail modal opens on row click", async ({ authenticatedPage }) => {
    const dataRow = await waitForDataRow(authenticatedPage);
    if (!dataRow) {
      test.skip();
      return;
    }
    await dataRow.click();
    await expect(authenticatedPage.locator('[role="dialog"]')).toBeVisible({
      timeout: 5000,
    });
  });
});

// 结构化筛选默认折叠以优先展示结果；展开后仍保持 GT-12423 的响应式几何：
// 1024px 下首行四筛选控件同行、表格产生横向滚动（sticky 操作列的前提）。
test.describe("disposal responsive layout (GT-12423)", () => {
  test.describe.configure({ timeout: 120_000 });
  // QC UI04 以租户管理员视角断言（平台管理员会多一个「租户范围」控件占位）
  test.use({ asRole: "tenant_admin" });

  test("filters are collapsed by default and expand from one clear trigger", async ({
    authenticatedPage: page,
  }) => {
    await page.goto("/zh/email-disposal/center");
    await page.waitForLoadState("networkidle");
    await expect(page.getByTestId("disposal-quick-filters")).toBeHidden();
    await page.getByTestId("disposal-filters-toggle").click();
    await expect(page.getByTestId("disposal-quick-filters")).toBeVisible({
      timeout: 15000,
    });
  });

  test("1024px keeps first four filters on one row and table scrolls horizontally", async ({
    authenticatedPage: page,
  }) => {
    await page.setViewportSize({ width: 1024, height: 1080 });
    await page.goto("/zh/email-disposal/center");
    await page.waitForLoadState("networkidle");
    await ensureFiltersExpanded(page);
    await expect(page.getByTestId("disposal-quick-filters")).toBeVisible({
      timeout: 15000,
    });
    const ids = [
      "disposal-date-range",
      "disposal-direction-filter",
      "disposal-sender-filter",
      "disposal-recipient-filter",
    ];
    const ys: number[] = [];
    for (const id of ids) {
      const box = await page.getByTestId(id).boundingBox();
      expect(box, id).not.toBeNull();
      ys.push(Math.round(box!.y));
    }
    for (const y of ys.slice(1)) expect(y).toBe(ys[0]);
    const overflow = await page
      .getByTestId("disposal-mail-table")
      .locator('[data-slot="table-container"]')
      .evaluate((node) => ({ sw: node.scrollWidth, cw: node.clientWidth }));
    expect(overflow.sw).toBeGreaterThan(overflow.cw);
  });
});

// GT-12420/GT-12419: 放行/删除/召回三弹窗对齐 html_spec
// email-handling-disposal-center layer-6/7/8 —— 宽度 sm:max-w-md(448px)、
// 确认按钮语义色（放行绿/删除红/召回橙，bg-{color}-500 + hover 600）。
test.describe("disposal action dialogs (GT-12420/GT-12419)", () => {
  // 高负载宿主上登录+大表查询远超默认 30s（tests/AGENTS.md 并行会话经验）
  test.describe.configure({ timeout: 120_000 });
  test.beforeAll(async ({ request }) => {
    await seedMailLogs(request);
    // 放行弹窗只对隔离中(action=quarantine)行启用，单独种一条
    const now = new Date().toISOString();
    await request.post(
      (process.env.INTERNAL_API_BASE_URL || "https://localhost:18081") +
        "/internal/mail-logs/ingest",
      {
        data: [
          {
            message_id: `<e2e-dialog-quarantine-${Date.now()}@test.local>`,
            client_ip: "10.9.9.9",
            sender: "dialog-quarantine@test.local",
            sender_domain: "test.local",
            recipients: ["recipient-q@testdomain.local"],
            subject: "E2E Dialog Quarantine Seed",
            action: "quarantine",
            status: "quarantined",
            received_at: now,
            timestamp: now,
          },
        ],
        headers: { "Content-Type": "application/json" },
      },
    );
  });

  async function filterStatus(
    page: import("@playwright/test").Page,
    label: string,
  ) {
    const statusFilter = page.getByTestId("disposal-status-filter");
    if (!(await statusFilter.isVisible().catch(() => false))) {
      await ensureFiltersExpanded(page);
    }
    await statusFilter.locator("button").first().click();
    await page
      .locator('[data-slot="popover-content"]')
      .getByText(label, { exact: true })
      .first()
      .click();
    await page.keyboard.press("Escape");
    await page.waitForTimeout(1500);
  }

  // 取 Tailwind 色板 token 在当前页面的计算色值（浏览器可能序列化为
  // lab()/rgb() 等不同格式，与 token 计算值对比才是稳定的行为断言）
  async function tokenColor(
    page: import("@playwright/test").Page,
    cssVar: string,
  ) {
    return page.evaluate((v) => {
      const d = document.createElement("div");
      d.style.backgroundColor = `var(${v})`;
      document.body.appendChild(d);
      const c = getComputedStyle(d).backgroundColor;
      d.remove();
      return c;
    }, cssVar);
  }

  async function openAndMeasure(
    page: import("@playwright/test").Page,
    batchTestId: string,
    dialogTestId: string,
    confirmColorVar?: string,
  ) {
    // 高负载下列表查询可能远超默认等待，用真实数据行作为就绪信号
    const row = await waitForDataRow(page, 30000);
    expect(row, "应有可选中的数据行").not.toBeNull();
    await row!.locator("input[type=checkbox], [role=checkbox]").first().click();
    await page.getByTestId(batchTestId).click();
    const dialog = page.getByTestId(dialogTestId);
    await expect(dialog).toBeVisible({ timeout: 8000 });
    await page.waitForTimeout(500); // 等 zoom-in-95 开场动画结束再量
    const box = await dialog.boundingBox();
    expect(box).not.toBeNull();
    // html_spec: sm:max-w-md = 448px
    expect(box!.width).toBeGreaterThanOrEqual(446);
    expect(box!.width).toBeLessThanOrEqual(450);
    if (confirmColorVar) {
      // GT-12419: 确认按钮语义色（html_spec bg-{color}-500）
      const confirm = dialog
        .locator('[data-slot="alert-dialog-action"], button')
        .filter({ hasNotText: "取消" })
        .last();
      const actual = await confirm.evaluate(
        (el) => getComputedStyle(el).backgroundColor,
      );
      expect(actual).toBe(await tokenColor(page, confirmColorVar));
    }
    return dialog;
  }

  test("delete dialog is 448px wide with red confirm", async ({
    authenticatedPage: page,
  }) => {
    await page.goto("/zh/email-disposal/center");
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(1500);
    const dialog = await openAndMeasure(
      page,
      "disposal-batch-delete",
      "disposal-delete-dialog",
      "--color-red-500",
    );
    await dialog.getByRole("button", { name: "取消", exact: true }).click();
  });

  test("recall dialog is 448px wide with orange confirm", async ({
    authenticatedPage: page,
  }) => {
    await page.goto("/zh/email-disposal/center");
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(1500);
    await filterStatus(page, "投递成功");
    const dialog = await openAndMeasure(
      page,
      "disposal-batch-recall",
      "disposal-recall-dialog",
      "--color-orange-500",
    );
    await dialog.getByRole("button", { name: "取消", exact: true }).click();
  });

  test("release dialog is 448px wide with green confirm", async ({
    authenticatedPage: page,
  }) => {
    await page.goto("/zh/email-disposal/center");
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(1500);
    await filterStatus(page, "隔离中");
    const dialog = await openAndMeasure(
      page,
      "disposal-batch-release",
      "disposal-release-dialog",
      "--color-green-500",
    );
    await dialog.getByRole("button", { name: "取消", exact: true }).click();
  });
});
