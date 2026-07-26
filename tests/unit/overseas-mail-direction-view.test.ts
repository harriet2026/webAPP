import { describe, expect, it } from 'vitest';
import zh from '../../messages/zh.json';
import en from '../../messages/en.json';
import th from '../../messages/th.json';
import ru from '../../messages/ru.json';
import {
  OVERSEAS_MAIL_ACTION_NONE,
  defaultOverseasMailConfig,
  defaultOverseasMailDirConfig,
  overseasMailDirectionView,
} from '@/types/overseas-mail';
import type { OverseasMailAction, OverseasMailDirection } from '@/types/overseas-mail';

const ALL_ACTIONS: OverseasMailAction[] = ['deliver', 'tagDeliver', 'quarantine', 'review', 'block', 'drop'];
const LOCALES = { zh, en, th, ru } as Record<string, { overseasMail: Record<string, string> }>;

// GT-11901. Two defects, both in how a switched-off direction is presented:
//
//   1. The action column rendered the stored action ("投递") and the effect
//      column rendered that action's description ("正常投递，不附加任何标记"),
//      even though a disabled direction is skipped by the milter outright. The
//      dropdown also stayed editable. Product spec TC003 requires a muted row
//      with a disabled dropdown; the implementation spec's wireframe renders
//      `----` / `(禁用)`.
//   2. Every direction defaulted to action=deliver, so switching one on armed
//      a rule that accepts the mail unchanged — a no-op wearing the costume of
//      a security control. Product (2026-07-10) settled on: ship disabled, but
//      pre-select `quarantine`, which is reversible where `block` is not.
describe('overseasMailDirectionView', () => {
  it('hides the action and announces the skip when a direction is off', () => {
    const view = overseasMailDirectionView({ enabled: false, action: 'block' });

    expect(view.actionLabel).toBe(OVERSEAS_MAIL_ACTION_NONE);
    expect(view.effectKey).toBe('overseasMail.effectSkipped');
    expect(view.actionEditable).toBe(false);
    expect(view.muted).toBe(true);
  });

  it('hides the action regardless of which action is stored', () => {
    for (const action of ALL_ACTIONS) {
      const view = overseasMailDirectionView({ enabled: false, action });
      expect(view.actionLabel, action).toBe(OVERSEAS_MAIL_ACTION_NONE);
      expect(view.effectKey, action).toBe('overseasMail.effectSkipped');
    }
  });

  it('shows the action and its description when a direction is on', () => {
    for (const action of ALL_ACTIONS) {
      const view = overseasMailDirectionView({ enabled: true, action });
      expect(view.actionLabel, action).not.toBe(OVERSEAS_MAIL_ACTION_NONE);
      expect(view.actionEditable, action).toBe(true);
      expect(view.muted, action).toBe(false);
      expect(view.effectKey, action).toBe(`overseasMail.action${action[0].toUpperCase()}${action.slice(1)}Desc`);
    }
  });

  it('falls back to the default view for a missing direction', () => {
    const view = overseasMailDirectionView(undefined);
    expect(view.actionEditable).toBe(false);
    expect(view.actionLabel).toBe(OVERSEAS_MAIL_ACTION_NONE);
  });
});

// 2026-07-13 (design/implement/spec/2026-07-13-overseas-geoip*): inbound now
// ships switched ON with `block` by default — unsolicited overseas mail into
// the org is the highest-risk direction, so a fresh gateway protects it out
// of the box rather than waiting for an operator to opt in. Outbound/internal
// keep the original ship-disabled-with-quarantine default described above.
describe('overseas mail defaults', () => {
  const OFF_BY_DEFAULT: OverseasMailDirection[] = ['outbound', 'internal'];

  it('ships inbound switched on, outbound/internal switched off', () => {
    const config = defaultOverseasMailConfig();
    expect(config.directions.inbound.enabled).toBe(true);
    for (const dir of OFF_BY_DEFAULT) {
      expect(config.directions[dir].enabled, dir).toBe(false);
    }
  });

  it('defaults all directions to block (inbound enabled, outbound/internal disabled)', () => {
    expect(defaultOverseasMailDirConfig().action).toBe('block');
    const config = defaultOverseasMailConfig();
    expect(config.directions.inbound.action).toBe('block');
    for (const dir of OFF_BY_DEFAULT) {
      expect(config.directions[dir].action, dir).toBe('block');
    }
  });

  it('never defaults to deliver, which would make enabling a no-op', () => {
    expect(defaultOverseasMailDirConfig().action).not.toBe('deliver');
  });
});

describe('overseas mail i18n', () => {
  for (const [locale, messages] of Object.entries(LOCALES)) {
    it(`${locale} translates effectSkipped`, () => {
      expect(messages.overseasMail.effectSkipped).toEqual(expect.any(String));
      expect(messages.overseasMail.effectSkipped.trim()).not.toBe('');
    });
  }
});

// GT-12114 Q-04：产品拍板"阻断全部方向时弹窗提示并禁止保存"。判定条件：
// 三个方向全部启用且动作均为阻断类（block/drop）——此时所有海外邮件流
// 都会被切断。任一方向禁用（该方向邮件正常放行）或使用非阻断动作则不拦。
describe('isOverseasBlockAllConfig (GT-12114 Q-04)', () => {
  const cfg = (actions: Partial<Record<OverseasMailDirection, { enabled: boolean; action: OverseasMailAction }>>) => {
    const base = defaultOverseasMailConfig();
    for (const [dir, v] of Object.entries(actions)) {
      base.directions[dir as OverseasMailDirection] = { ...base.directions[dir as OverseasMailDirection], ...v };
    }
    return base;
  };

  it('三方向全启用且全为 block/drop → true', async () => {
    const { isOverseasBlockAllConfig } = await import('@/types/overseas-mail');
    expect(isOverseasBlockAllConfig(cfg({
      inbound: { enabled: true, action: 'block' },
      outbound: { enabled: true, action: 'drop' },
      internal: { enabled: true, action: 'block' },
    }))).toBe(true);
  });

  it('任一方向禁用 → false（禁用方向邮件正常放行）', async () => {
    const { isOverseasBlockAllConfig } = await import('@/types/overseas-mail');
    expect(isOverseasBlockAllConfig(cfg({
      inbound: { enabled: true, action: 'block' },
      outbound: { enabled: true, action: 'block' },
      internal: { enabled: false, action: 'block' },
    }))).toBe(false);
  });

  it('任一方向为非阻断动作 → false', async () => {
    const { isOverseasBlockAllConfig } = await import('@/types/overseas-mail');
    expect(isOverseasBlockAllConfig(cfg({
      inbound: { enabled: true, action: 'block' },
      outbound: { enabled: true, action: 'quarantine' },
      internal: { enabled: true, action: 'drop' },
    }))).toBe(false);
  });

  it('四语均有 blockAll 弹窗文案', () => {
    for (const [locale, dict] of Object.entries(LOCALES)) {
      expect(dict.overseasMail.blockAllTitle, `${locale} blockAllTitle`).toBeTruthy();
      expect(dict.overseasMail.blockAllMessage, `${locale} blockAllMessage`).toBeTruthy();
    }
  });
});
