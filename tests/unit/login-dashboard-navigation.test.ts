import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const LOGIN_PAGE = path.resolve(
  __dirname,
  '../../src/app/[locale]/(auth)/login/page.tsx',
);

describe('GT-12808 登录成功跳转', () => {
  it('使用完整页面 replace 进入 Dashboard，避免依赖可能挂起的 RSC 导航', () => {
    const source = readFileSync(LOGIN_PAGE, 'utf8');

    expect(source).toContain("window.location.replace(`/${locale}/dashboard`)");
    expect(source).not.toMatch(/router\.(?:push|replace)\(`\/\$\{locale\}\/dashboard`\)/);
  });
});
