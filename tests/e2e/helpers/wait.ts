import { Page, Locator } from '@playwright/test';

export async function waitForToast(page: Page, text?: string, timeout = 5000) {
  const toast = page.locator('[data-sonner-toast], [role="alert"]').first();
  await toast.waitFor({ state: 'visible', timeout });
  if (text) {
    await toast.waitFor({ state: 'visible', timeout });
  }
  return toast;
}

export async function waitForTableLoad(page: Page, timeout = 10000) {
  const table = page.locator('.rounded-md.border table, table').first();
  const rowCount = table.locator('tbody tr');
  await rowCount.first().waitFor({ state: 'visible', timeout });
  return table;
}

export async function waitForDialog(page: Page, timeout = 5000) {
  const dialog = page.locator('[role="dialog"]');
  await dialog.waitFor({ state: 'visible', timeout });
  return dialog;
}

export async function waitForDialogClose(page: Page, timeout = 5000) {
  const dialog = page.locator('[role="dialog"]');
  await dialog.waitFor({ state: 'hidden', timeout });
}

export async function clickButtonWithIcon(page: Page, iconName: string) {
  const button = page.locator(`button:has(svg[class*="${iconName}"]), button:has(svg.lucide-${iconName})`).first();
  await button.click();
  return button;
}

export async function fillForm(page: Page, fields: Record<string, string>) {
  for (const [fieldId, value] of Object.entries(fields)) {
    const input = page.locator(`input[id="${fieldId}"], textarea[id="${fieldId}"]`);
    await input.fill(value);
  }
}

export async function selectOption(page: Page, fieldId: string, value: string) {
  const select = page.locator(`select[id="${fieldId}"], [role="combobox"][id="${fieldId}"]`);
  const tag = await select.evaluate(el => el.tagName.toLowerCase());
  
  if (tag === 'select') {
    await select.selectOption(value);
  } else {
    await select.click();
    await page.locator(`[role="option"][data-value="${value}"]`).click();
  }
}
