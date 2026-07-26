import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { ForcedChangeStep } from '../forced-change-step';

// GT-11959, second review round.
//
// The server hands back the EFFECTIVE policy as soon as the user is identified —
// on the forced-change branch of login (password already verified) and from
// reset/verify-code (code already proven). The client was discarding both and
// gating on the PUBLIC baseline instead.
//
// The public baseline is fetched on page mount, before anyone has said who they
// are, so by construction it is the LOOSEST possible answer. For a user whose
// tenant tightened the rules that means the UI ticks every box, enables Submit,
// and the server then rejects the password — with the user unable to tell what is
// actually required.
//
// So the gate must follow the POLICY IT IS GIVEN, not a hardcoded default. That is
// what makes passing the tenant's policy down actually change anything.

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string, vars?: Record<string, unknown>) => {
    if (key === 'pwd.minLen') return `至少 ${vars?.n} 位`;
    if (key === 'pwd.classes') return `至少 ${vars?.n} 类字符`;
    if (key === 'auth.setupSubmit') return '提交';
    return key;
  },
}));

const BASELINE = { minLength: 10, minCharClasses: 2, historyLimit: 3 };
const TENANT_STRICTER = { minLength: 16, minCharClasses: 4, historyLimit: 8 };

function setup(policy?: typeof BASELINE) {
  const onSubmit = vi.fn();
  render(
    <ForcedChangeStep
      submitting={false}
      error={null}
      policy={policy}
      onSubmit={onSubmit}
      onBack={vi.fn()}
    />,
  );
  return { onSubmit };
}

// A password that satisfies the BASELINE (>=10 chars, >=2 classes) but not the
// tenant's tightening (>=16 chars, all 4 classes). This is the exact input that
// used to sail through the client and then bounce off the server.
const OK_FOR_BASELINE_NOT_TENANT = 'Passw0rdabc';

function fillBoth(pw: string) {
  fireEvent.change(document.querySelector('#osg-fc-new')!, { target: { value: pw } });
  fireEvent.change(document.querySelector('#osg-fc-confirm')!, { target: { value: pw } });
}

const submitBtn = () => screen.getByRole('button', { name: '提交' });

describe('the password gate follows the policy it is handed (GT-11959)', () => {
  it('accepts a baseline-compliant password when the BASELINE is in force', () => {
    setup(BASELINE);
    fillBoth(OK_FOR_BASELINE_NOT_TENANT);

    expect(submitBtn()).toBeEnabled();
  });

  it('REJECTS that same password when the tenant has tightened the policy', () => {
    setup(TENANT_STRICTER);
    fillBoth(OK_FOR_BASELINE_NOT_TENANT);

    expect(
      submitBtn(),
      'the gate is still using the baseline: this password satisfies min 10 / 2 classes but ' +
        'not the tenant\'s min 16 / 4 classes, so the user would be told it is fine and then ' +
        'rejected by the server',
    ).toBeDisabled();
  });

  // (No assertion on the checklist COPY: PasswordRuleList receives minLength /
  // minCharClasses as numeric props, so the behavioural assertions above already
  // prove it follows the policy. Asserting the rendered sentence as well would only
  // couple the test to i18n wording.)

  it('accepts a password that meets the tenant rule', () => {
    setup(TENANT_STRICTER);
    fillBoth('Str0ng#Passw0rd!42'); // 18 chars, all four classes

    expect(submitBtn()).toBeEnabled();
  });

  // policy is optional so an older server still parses; the component must fall
  // back to its conservative defaults rather than crash or gate on nothing.
  it('falls back to conservative defaults when no policy is supplied', () => {
    setup(undefined);
    fillBoth('short');
    expect(submitBtn()).toBeDisabled();

    fillBoth(OK_FOR_BASELINE_NOT_TENANT);
    expect(submitBtn()).toBeEnabled();
  });
});
