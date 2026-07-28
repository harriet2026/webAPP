/**
 * 自文档化测试用例「契约示例」—— 发件人过滤规则（片段）
 *
 * 这不是照抄的成品，而是演示 html-spec-to-testcase 技能要求的落地形态：
 * 「测试用例即文档」——每条 test 自带 用例ID/优先级/类型/前置/预期/来源/双指纹，
 * 全部进 Playwright 原生 HTML/JSON/JUnit 报告，不再另写 qc/cases/*.md。
 * 文档视图 = reporter 直接呈现；报表 = json/junit 里的 tag+annotation。
 *
 * 文件级元数据（模块/覆盖/不覆盖/风险）放本段 JSDoc：
 *   模块:   发件人过滤规则 (filter-rules-pipeline-sender-filter)
 *   覆盖:   黑白名单 CRUD / 条件树 / 动作枚举 / 白名单模式 / 运行态命中
 *   不覆盖: priority 数值边界穷举（html_spec 未定义 → 移交 qc-test-workflow，记入覆盖矩阵「html_spec 未定义」格）
 *   主要风险: html_spec §9 多处差异点滞后于实现——断言值一律以契约代码为准
 */
import { test, expect } from '@playwright/test';
import { SenderFilterDrawerPage } from '../../pages/sender-filter-drawer.page';
// 复用 qc/ 现有 PO 层 + lib helper，勿重造。

test.describe('发件人过滤规则 / 抽屉表单校验', () => {
  test(
    'SF-VAL-009 白名单动作非放行应被拒', // 标题 = 用例ID + 测试点（人读即懂）
    {
      tag: ['@SF-VAL-009', '@P0', '@ui'], // 用例ID(可过滤) · 优先级 · 类型
      annotation: [
        { type: 'precondition', description: '管理员已登录，发件人过滤抽屉已打开' },
        // 测点来源：source 的锚点 = index.html 里真实的 id= 值（此处 business-logic），
        //   下面的 hash 由 fingerprint.py 实算，写入前必须跑一次确认不报 anchor not found。
        //   这些值对应 sender_filter 模块 @2026-07-12，套到你的模块时对你的锚点/文件重算。
        { type: 'source', description: 'html_spec#business-logic · 表单校验区' },
        { type: 'source-rev', description: 'business-logic @ 3b7df746d623' }, // = fingerprint.py source-rev index.html business-logic
        // 预期值溯源到「契约代码」，不是 html_spec（RED 实证：html_spec 会滞后）
        {
          type: 'expected',
          description:
            '前端 zod 拦截，报错 whitelistAcceptOnly ← webapp/src/components/security/sender-filter/SenderFilterDrawer.tsx#ruleSchema.superRefine',
        },
        // impl-rev = 整文件 hash（同文件所有符号共享同一值；#符号 只是人读定位符）
        { type: 'impl-rev', description: 'SenderFilterDrawer.tsx#ruleSchema @ 7f32086bdc93' }, // = fingerprint.py impl-rev <该文件>
      ],
    },
    async ({ page }) => {
      const drawer = new SenderFilterDrawerPage(page);
      await test.step('选择白名单 + 动作=拒绝', async () => {
        // 步骤用 test.step —— 进 trace/报告逐步展开，即“测试步骤”文档
        await drawer.open();
        await drawer.selectListType('whitelist');
        await drawer.selectAction('reject');
      });
      await test.step('保存并断言前端校验拦截', async () => {
        await drawer.clickSave();
        // 分层断言：本条是 UI 层用例 → 断【前端】zod 契约值，不断 html_spec 文案
        expect(await drawer.hasValidationError(/whitelistAcceptOnly/)).toBeTruthy();
      });
    },
  );

  test(
    'SF-VAL-IP-01 后端应校验非法 CIDR',
    { tag: ['@SF-VAL-IP-01', '@P1', '@api'], annotation: [/* source/source-rev/expected/impl-rev 同上 */] },
    async ({ request }) => {
      // 已知未修缺陷：用 test.fail() 而非 test.skip()。
      // 修复后此用例自动转红，提醒回收 fail 标记；skip 则会永远静默、功能已可用却无人守护。
      test.fail();
      // ... 发非法 CIDR，断言应 400（期望值来自后端 handler 契约）
    },
  );
});
