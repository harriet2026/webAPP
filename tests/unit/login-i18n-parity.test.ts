import { describe, it, expect } from 'vitest';
import zh from '../../messages/zh.json';
import en from '../../messages/en.json';
import th from '../../messages/th.json';
import ru from '../../messages/ru.json';

type Messages = Record<string, unknown>;

// Keys Plan 5 §Task 2 mandates in every locale's `auth` object. A key missing
// from any single locale fails this test — that's the whole point: keep the
// four locales in lockstep as the login state machine grows.
//
// T5 cleanup: `switchToSms`/`switchToEmail`/`twoFactorCodePlaceholder` were
// dead code (Spec §0.3 C1 explicitly does not implement channel switching) and
// have been removed from the message files — do not re-add them here.
// GT-11669 review cleanup: `username`/`loginSubtitle` lost their last caller
// when the credentials step moved to `account` and the page dropped its
// subtitle — also removed, also do not re-add.
const REQUIRED = [
  'rememberAccount',
  'showPassword',
  'hidePassword',
  'forgotPassword',
  'captchaLabel',
  'captchaRefresh',
  'remainingAttempts',
  'accountLocked',
  'resendIn',
  'resend',
  'trustDevice',
  'trustDeviceHint',
  'changePwdTitle',
  'changePwdHint',
  'newPassword',
  'confirmPassword',
  'pwdMismatch',
  'pwdWeak',
  'forgotTitle',
  'forgotAccount',
  'sendCode',
  'sendCodeFailed',
  'resetSuccess',
  'loginSuccess',
  'brandTagline',
  'brandFeature1',
  'brandFeature2',
  'brandFeature3',
  'brandFeature4',
  'brandFeature1Desc',
  'brandFeature2Desc',
  'brandFeature3Desc',
  'brandFeature4Desc',
  'brandProductName',
  'brandHeadline',
  'brandCopyright',
  'welcomeTitle',
  'welcomeSubtitle',
  'account',
  'accountPlaceholder',
  'passwordPlaceholder',
  'forgotHint',
  'loginSuccessHint',
  // Previously uncovered (T4): used by login components but absent from parity.
  'twoFactorCode',
  'otpBoxLabel',
  'back',
  'verify',
  'password',
  'loginButton',
  'demoEntry',
  'twoFactorRequiredHint',
  'setupSubmit',
] as const;

describe('login auth.* i18n parity', () => {
  it.each([
    ['en', en],
    ['zh', zh],
    ['ru', ru],
    ['th', th],
  ] as const)('%s has every required auth key', (_name, m) => {
    const auth = (m as Messages).auth as Record<string, unknown> | undefined;
    expect(auth, `${_name}.auth object missing`).toBeDefined();
    for (const k of REQUIRED) {
      expect(auth![k], `${_name}.auth.${k} missing`).toBeDefined();
      expect(typeof auth![k], `${_name}.auth.${k} must be a string`).toBe('string');
      // Non-empty + not a leaked key path.
      expect((auth![k] as string).length, `${_name}.auth.${k} empty`).toBeGreaterThan(0);
      expect(auth![k], `${_name}.auth.${k} value equals key path`).not.toBe(`auth.${k}`);
    }
  });

  it('remainingAttempts / resendIn / accountLocked / otpBoxLabel use placeholders', () => {
    for (const m of [en, zh, ru, th]) {
      const auth = (m as Messages).auth as Record<string, string>;
      expect(auth.remainingAttempts).toMatch(/\{n\}/);
      expect(auth.resendIn).toMatch(/\{n\}/);
      expect(auth.accountLocked).toMatch(/\{time\}/);
      expect(auth.otpBoxLabel).toMatch(/\{n\}/);
    }
  });

  // The copyright year is interpolated by BrandPanel, not baked into the
  // message files — a literal year silently goes stale every January.
  it('brandCopyright interpolates {year} and hardcodes no literal year', () => {
    for (const m of [en, zh, ru, th]) {
      const auth = (m as Messages).auth as Record<string, string>;
      expect(auth.brandCopyright).toMatch(/\{year\}/);
      expect(auth.brandCopyright).not.toMatch(/\b20\d{2}\b/);
    }
  });

  // Keys deleted by the GT-11669 review must not creep back via a bad merge.
  it.each([
    ['en', en],
    ['zh', zh],
    ['ru', ru],
    ['th', th],
  ] as const)('%s has no resurrected dead auth keys', (_name, m) => {
    const auth = (m as Messages).auth as Record<string, unknown>;
    for (const k of ['brandEyebrow', 'username', 'loginSubtitle']) {
      expect(auth[k], `${_name}.auth.${k} resurrected`).toBeUndefined();
    }
  });
});
