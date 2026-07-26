import { test, expect } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

// GT-12137（复开）：批量导入的文件格式与「导出」一致（rule-settings/v1 JSON）。
// L1 闭环：建规则 → UI 导出 .json → 删除规则 → 弹窗上传该 .json → 预览 → 导入 →
// 校验规则按原 name/action/priority 还原。另含负例：非 JSON 文件被拒。

const BASE = process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:3000';
// 写请求必须打绝对 apiserver 地址（webapp/AGENTS.md：相对路径会被 301 降级成 GET）。
const API = process.env.API_BASE_URL || 'http://localhost:18080/api/v1';

async function apiLogin(request: import('@playwright/test').APIRequestContext) {
  const resp = await request.post(`${API}/auth/login`, {
    data: { username: 'admin', password: 'admin123' },
  });
  expect(resp.ok()).toBeTruthy();
  return (await resp.json()).token as string;
}

async function login(page: import('@playwright/test').Page) {
  await page.goto(`${BASE}/zh/login`);
  await page.waitForLoadState('networkidle');
  await page.getByPlaceholder(/账号|用户名|username/i).fill('admin');
  await page.getByPlaceholder(/密码|password/i).fill('admin123');
  const resp = page.waitForResponse((r) => r.url().includes('/api/v1/auth/login'), { timeout: 20000 });
  await page.getByRole('button', { name: /登\s*录|log\s*in|sign\s*in/i }).click();
  await resp;
  await page.waitForURL((url) => !/\/login/.test(url.pathname), { timeout: 20000 });
}

test('GT-12137 导入格式与导出一致：JSON 导出→删除→导入还原闭环', async ({ page }) => {
  test.setTimeout(90_000);

  const token = await apiLogin(page.request);
  const auth = { Authorization: `Bearer ${token}` };

  const uniq = Date.now() % 100000;
  const ip = `203.0.113.${uniq % 250}`;
  const name = `gt12137-json-${uniq}`;
  const priority = 4000 + (uniq % 500);

  // 1) 造一条黑名单规则（隔离动作 + 备注 + 指定优先级）
  const created = await page.request.post(`${API}/ip-filter/rules`, {
    headers: auth,
    data: {
      name, list_type: 'blacklist', ip_config_type: 'single', ip_value: ip,
      action: 'quarantine', priority, is_active: true, description: '导出导入闭环',
    },
  });
  expect(created.ok()).toBeTruthy();
  const ruleId = (await created.json()).id as number;

  await login(page);
  await page.goto(`${BASE}/zh/security/ip-filter`);
  await page.waitForLoadState('networkidle');

  // 2) UI 导出，拿到与生产一致的 .json 下载文件
  const downloadP = page.waitForEvent('download', { timeout: 20000 });
  await page.getByRole('button', { name: '导出' }).first().click();
  const download = await downloadP;
  expect(download.suggestedFilename()).toMatch(/\.json$/);
  const jsonPath = path.join(os.tmpdir(), `gt12137-export-${uniq}.json`);
  await download.saveAs(jsonPath);
  const envelope = JSON.parse(fs.readFileSync(jsonPath, 'utf-8'));
  expect(envelope.version).toBe('rule-settings/v1');
  expect(envelope.scope).toBe('ip_filter');

  // 3) 删除该规则，制造「导入还原」场景
  const del = await page.request.delete(`${API}/ip-filter/rules/${ruleId}`, { headers: auth });
  expect(del.ok()).toBeTruthy();

  // 4) 打开批量导入弹窗
  await page.getByRole('button', { name: /批量导入|导入/ }).first().click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByText('批量导入 IP 规则')).toBeVisible({ timeout: 10000 });

  // 负例：上传非 JSON（CSV）→ 明确报错，不再被当作合法导入格式
  const csvPath = path.join(os.tmpdir(), `gt12137-bad-${uniq}.csv`);
  fs.writeFileSync(csvPath, 'IP,动作,备注\n1.2.3.4,拦截,x\n');
  await dialog.locator('input[type=file]').setInputFiles(csvPath);
  await expect(page.getByText(/JSON 解析失败/)).toBeVisible({ timeout: 8000 });

  // 5) 上传导出的 JSON：预览出现，且我们的行为「可导入」（其余既有规则标「已存在」）
  await dialog.locator('input[type=file]').setInputFiles(jsonPath);
  await expect(dialog.getByText(/共 \d+ 条/)).toBeVisible({ timeout: 8000 });

  // 预览态布局回归（用户截图 bug）：面板须真拿到 max-w-3xl 宽度，
  // 且所有内容（工具栏/预览表）不得横向溢出面板右缘。
  const panelBox = await dialog.boundingBox();
  expect(panelBox, 'dialog panel should have a bounding box').toBeTruthy();
  expect(panelBox!.width, 'dialog should be widened by max-w-3xl, not clamped to sm').toBeGreaterThan(700);
  const overflowCount = await dialog.evaluate((d) => {
    const dr = d.getBoundingClientRect();
    let n = 0;
    d.querySelectorAll('*').forEach((el) => {
      if (el.getBoundingClientRect().right > dr.right + 1) n += 1;
    });
    return n;
  });
  expect(overflowCount, 'no dialog children may overflow the panel right edge').toBe(0);
  const ourRow = dialog.locator('tr', { hasText: ip });
  await expect(ourRow.getByText('可导入')).toBeVisible();
  await expect(ourRow.getByText('隔离')).toBeVisible();
  await expect(ourRow.getByText('导出导入闭环')).toBeVisible();

  // 6) 默认「跳过已存在」策略下只导入我们这 1 条
  await dialog.getByRole('button', { name: /导入 1 条/ }).click();
  await expect(page.getByText(/导入完成/)).toBeVisible({ timeout: 12000 });

  // 7) 回读校验：name/action/priority/备注 与导出文件一致（闭环不丢属性）
  const check = await page.request.get(
    `${API}/ip-filter/rules?list_type=blacklist&q=${encodeURIComponent(ip)}&page=1&page_size=10`,
    { headers: auth },
  );
  expect(check.ok()).toBeTruthy();
  const items = (await check.json()).items as Array<Record<string, unknown>>;
  const restored = items.find((r) => r.ip_value === ip);
  expect(restored, 'imported rule should be recreated').toBeTruthy();
  expect(restored!.name).toBe(name);
  expect(restored!.action).toBe('quarantine');
  expect(restored!.priority).toBe(priority);
  expect(restored!.description).toBe('导出导入闭环');

  // 清理
  await page.request.delete(`${API}/ip-filter/rules/${restored!.id}`, { headers: auth });
  fs.unlinkSync(jsonPath);
  fs.unlinkSync(csvPath);
});
