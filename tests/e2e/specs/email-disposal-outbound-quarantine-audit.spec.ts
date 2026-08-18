import { test, expect } from '../fixtures/auth.fixture';
import { findRowBySubject } from '../helpers/mail-list';
import { execFileSync } from 'child_process';
import * as path from 'path';

// GT-12824 前后端全链路 e2e：外发邮件命中"隔离"动作规则 → 执行面降级为审核
// （downgradeOutboundQuarantine）→ 邮件处置中心的列表动作、详情"处置依据"
// 徽标与命中模块清单都必须显示执行动作"审核"，绝不能显示"隔离"（重开根因：
// 展示面抄了规则原文，列表"审核中"与详情"隔离"打架）。
//
// 邮件走**真实网关路径**（587 SASL 认证外发 → milter 降级 → email JSONL →
// fluent-bit → ingest → mail_log），后端种子由 python 驱动
// tests/integration/gt12824_outbound_seed.py 完成——不能用 internal ingest
// 直灌：直灌写入的是脚本自己编的 disposal_basis，会完全绕过被测链路。
// 栈未开 OSG_LOCAL_AUTH_ENABLED（local SASL）时驱动 exit 3 → 本 spec skip。

const REPO_ROOT = path.resolve(__dirname, '../../../../');
const SEED_SCRIPT = path.join(REPO_ROOT, 'tests', 'integration', 'gt12824_outbound_seed.py');

interface SeedResult {
  ok: boolean;
  subject: string;
  mail_log_id: number;
  action: string;
  basis_action: string;
  tenant_id: number;
}

function runSeedDriver(): SeedResult {
  const out = execFileSync('python3', [SEED_SCRIPT], {
    cwd: path.join(REPO_ROOT, 'tests', 'integration'),
    timeout: 180_000,
    encoding: 'utf8',
  });
  const lastLine = out.trim().split('\n').pop() ?? '';
  return JSON.parse(lastLine) as SeedResult;
}

test.describe('GT-12824 外发隔离降级为审核（前后端全链路）', () => {
  test('列表动作、详情处置依据与命中模块均显示执行动作"审核"', async ({ authenticatedPage }) => {
    // 真实邮件链路：发信 + fluent-bit 摄入轮询（驱动内预算 90s）+ UI 断言。
    test.setTimeout(240_000);

    let seed: SeedResult;
    try {
      seed = runSeedDriver();
    } catch (e: unknown) {
      const err = e as { status?: number; stdout?: Buffer | string; stderr?: Buffer | string };
      const stdout = err.stdout?.toString() ?? '';
      if (err.status === 3) {
        test.skip(true, `dev 栈未开 OSG_LOCAL_AUTH_ENABLED，无法走真实 SASL 外发链路：${stdout}`);
      }
      throw new Error(`seed driver failed: ${stdout} ${err.stderr?.toString() ?? String(e)}`);
    }

    // 后端链路自证（分层归因：这两条红 = 后端降级/写入回归，与 UI 无关）。
    expect(seed.ok).toBe(true);
    expect(seed.action, '整封 mail_log.action 应为执行动作 audit').toBe('audit');
    expect(
      seed.basis_action,
      'disposal_basis.action 应为执行动作 audit（GT-12824 重开根因：曾抄规则原文 quarantine）',
    ).toBe('audit');

    // —— 前端断言：列表 ——
    await authenticatedPage.goto('/zh/email-disposal/center');
    await authenticatedPage.waitForLoadState('networkidle');

    const row = await findRowBySubject(authenticatedPage, seed.subject, 15_000);
    expect(row, `列表应能找到本次外发邮件（subject=${seed.subject}）`).not.toBeNull();
    await expect(row!, '列表行应显示"审核"族动作/状态').toContainText('审核');
    await expect(row!, '列表行不得出现"隔离"（该邮件从未被隔离）').not.toContainText('隔离');

    // —— 前端断言：详情抽屉 ——
    await row!.click();
    const dialog = authenticatedPage.locator('[data-slot="sheet-content"]');
    await expect(dialog).toBeVisible({ timeout: 10_000 });

    const basisBadge = dialog.getByTestId('analysis-disposal-basis-action');
    await expect(basisBadge, '处置依据动作徽标 = 执行动作"审核"').toHaveText('审核', {
      timeout: 10_000,
    });

    // 命中模块清单里本条规则的条目同样显示执行动作。
    const basisSection = dialog.getByTestId('analysis-disposal-basis');
    await expect(basisSection, '安全分析处置依据区不得出现"隔离"').not.toContainText('隔离');
    const moduleItems = dialog.getByTestId('analysis-hit-module-item');
    if ((await moduleItems.count()) > 0) {
      await expect(moduleItems.first(), '命中模块条目应显示执行动作"审核"').toContainText('审核');
      await expect(moduleItems.first(), '命中模块条目不得显示"隔离"').not.toContainText('隔离');
    }
  });
});
