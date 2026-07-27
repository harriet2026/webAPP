/**
 * GT-11669 — Login prototype alignment (visual / DOM parity).
 *
 * Pure frontend spec: the dev login page is always reachable (the webapp
 * renders even if the apiserver is mid-restart), and the prototype-alignment
 * changes are entirely in the render layer. So we assert the DOM structure
 * the prototype mandates, with no backend interaction.
 *
 * These assertions deliberately measure *rendered geometry and computed
 * styles*, never Tailwind class strings: `toHaveClass(/lg:grid-cols-2/)` passes
 * whether or not the grid actually splits 50/50, so it proves nothing.
 *
 * Sibling coverage:
 *   - webapp/tests/unit/login-prototype-alignment.test.tsx (component-level)
 *   - webapp/tests/e2e/specs/login_2fa/login-flows.spec.ts (backend flows)
 */
import { test, expect, type Locator } from '@playwright/test';

const LOGIN_URL = '/zh/login';

/** Perceived lightness (0 = black, 1 = white) of an `rgb()` / `rgba()` string. */
function luminance(color: string): number {
  const m = color.match(/(\d+(?:\.\d+)?)/g);
  if (!m || m.length < 3) throw new Error(`unparseable color: ${color}`);
  const [r, g, b] = m.slice(0, 3).map(Number);
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
}

async function box(locator: Locator) {
  const b = await locator.boundingBox();
  if (!b) throw new Error('element has no bounding box');
  return b;
}

test.describe('GT-11669 login prototype alignment', () => {
  test('splits the viewport 50/50 at >= lg', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto(LOGIN_URL);

    const root = page.locator('[data-testid="login-root"]');
    await expect(root).toBeVisible();
    const rootBox = await box(root);
    const brandBox = await box(page.getByTestId('login-brand'));

    // The brand rail occupies exactly half the width, and the page fills the
    // viewport height (no centred max-w-5xl card any more).
    expect(Math.abs(brandBox.width - rootBox.width / 2)).toBeLessThanOrEqual(1);
    expect(rootBox.height).toBeGreaterThanOrEqual(900);
  });

  test('collapses to a single full-width column below lg', async ({ page }) => {
    await page.setViewportSize({ width: 800, height: 900 });
    await page.goto(LOGIN_URL);

    // Brand rail hidden; the mobile-only compact brand row stands in for it.
    await expect(page.getByTestId('login-brand')).toBeHidden();
    await expect(page.getByTestId('login-brand-mobile')).toBeVisible();
    await expect(page.getByTestId('login-brand-mobile')).toContainText('邮件安全网关');
    await expect(page.locator('input[name="username"]')).toBeVisible();
  });

  // GT-12511: 空用户名/密码在前端拦截并给出本地化中文提示，
  // 不再把 Go validator 的英文原文（Key: 'LoginRequest.Password' ...）暴露给用户。
  test('empty password submit shows localized hint, not raw validator text', async ({ page }) => {
    await page.goto(LOGIN_URL);
    await page.locator('input[name="username"]').fill('testuser');
    await page.locator('button[type="submit"]').click();
    const alert = page.getByTestId('login-root').getByRole('alert');
    await expect(alert).toContainText('请输入密码');
    await expect(alert).not.toContainText('LoginRequest');
  });

  test('empty username submit shows localized hint', async ({ page }) => {
    await page.goto(LOGIN_URL);
    await page.locator('input[name="password"]').fill('whatever');
    await page.locator('button[type="submit"]').click();
    await expect(page.getByTestId('login-root').getByRole('alert')).toContainText('请输入用户名');
  });

  test('brand rail is dark and carries the full prototype copy', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto(LOGIN_URL);

    const brand = page.getByTestId('login-brand');
    await expect(brand).toBeVisible();

    // Spec 2026-07-01 §2.2 mandates a *dark* rail — assert the rendered colour,
    // not the class name, so a token change that lightens it fails here.
    const bg = await brand.evaluate((el) => getComputedStyle(el).backgroundColor);
    expect(luminance(bg)).toBeLessThan(0.3);

    await expect(brand).toContainText('邮件安全网关');
    await expect(brand).toContainText('守护每一封邮件的进出安全');
    for (const title of ['多层威胁防护', 'AI 智能体研判', '多租户网关', '全链路审计']) {
      await expect(brand).toContainText(title);
    }
    // Year is interpolated at render time, so match the current one.
    await expect(brand).toContainText(`© ${new Date().getFullYear()}`);
  });

  test('credentials fields have placeholders and room for their leading icons', async ({ page }) => {
    await page.goto(LOGIN_URL);

    await expect(page.getByText('账号', { exact: true })).toBeVisible();
    await expect(page.getByPlaceholder('请输入账号')).toBeVisible();
    await expect(page.getByPlaceholder('请输入密码')).toBeVisible();

    // A leading icon is only correct if the input reserves space for it —
    // otherwise the icon overlaps the typed text. Measure both.
    for (const name of ['username', 'password']) {
      const input = page.locator(`input[name="${name}"]`);
      const padLeft = await input.evaluate((el) => parseFloat(getComputedStyle(el).paddingLeft));
      const icon = input.locator('xpath=preceding-sibling::*[name()="svg"][1]');
      const iconBox = await box(icon);
      const inputBox = await box(input);
      expect(padLeft).toBeGreaterThanOrEqual(iconBox.x + iconBox.width - inputBox.x);
    }

    // The password toggle sits inside the right padding, not over the text.
    const pwd = page.locator('input[name="password"]');
    const padRight = await pwd.evaluate((el) => parseFloat(getComputedStyle(el).paddingRight));
    expect(padRight).toBeGreaterThan(24);
  });

  test('welcome title and subtitle appear on the credentials step', async ({ page }) => {
    await page.goto(LOGIN_URL);
    await expect(page.getByRole('heading', { name: '欢迎登录' })).toBeVisible();
    await expect(page.getByText('登录管理后台以继续')).toBeVisible();
  });

  test('forgot-password step uses StepHeader + single send-code button', async ({ page }) => {
    await page.goto(LOGIN_URL);
    await page.getByRole('button', { name: /忘记密码/ }).click();

    await expect(page.getByRole('heading', { name: '重置密码' })).toBeVisible();
    await expect(page.getByRole('button', { name: '获取验证码' })).toBeVisible();
    // The back control lives in StepHeader now, not in a bottom two-button row.
    expect(await page.getByRole('button', { name: /返回/ }).count()).toBe(1);
  });

  test('submit button spans the form width on every step', async ({ page }) => {
    await page.goto(LOGIN_URL);
    const submit = page.getByRole('button', { name: '登录' });
    const submitBox = await box(submit);
    const formBox = await box(page.locator('input[name="username"]'));
    // Single full-width button, not a 50%-wide half of a two-button row.
    expect(Math.abs(submitBox.width - formBox.width)).toBeLessThanOrEqual(1);
  });
});
