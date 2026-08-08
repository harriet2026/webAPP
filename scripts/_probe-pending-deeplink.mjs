import { chromium } from '@playwright/test';

const BASE = 'http://localhost:3000';
const b = await chromium.launch();
const ctx = await b.newContext({
  viewport: { width: 1694, height: 1046 },
  locale: 'zh-CN',
  colorScheme: 'light',
});
await ctx.addCookies([{ name: 'osg_form_override', value: 'ai-single', url: BASE }]);
const p = await ctx.newPage();
const apiCalls = [];
p.on('request', (r) => {
  const u = r.url();
  if (u.includes('/mail-logs?')) apiCalls.push(decodeURIComponent(u.split('/mail-logs?')[1]));
});
await p.goto(`${BASE}/zh/email-disposal/center?view=pending`, { waitUntil: 'domcontentloaded', timeout: 120000 });
await p.waitForFunction(() => document.body.innerText.replace(/\s+/g, '').length > 200, { timeout: 90000 });
// 等表格真正出行（非“加载中”）
await p.waitForFunction(() => {
  const rows = [...document.querySelectorAll('table tbody tr')];
  return rows.length > 0 && !rows[0].innerText.includes('加载中');
}, { timeout: 60000 }).catch(() => console.log('[warn] 行渲染等待超时'));
await p.waitForTimeout(2000);

// 收集 mail-logs 请求里携带的 advanced_filters
console.log('[mail-logs 请求数]', apiCalls.length);
for (const q of apiCalls) {
  const m = q.match(/advanced_filters=([^&]+)/);
  console.log('[req] advanced_filters =', m ? m[1] : '(无)');
}
// 列表里出现的状态徽章文本统计
const badges = await p.evaluate(() => {
  const txt = [...document.querySelectorAll('table tbody tr')].map((tr) => tr.innerText.replace(/\s+/g, ' ').trim());
  return txt.slice(0, 30);
});
console.log('[前若干行文本]');
badges.forEach((t, i) => console.log(`  行${i}: ${t.slice(0, 120)}`));
await p.screenshot({ path: '/tmp/gt12818/pending-deeplink.png', fullPage: false });
await b.close();
