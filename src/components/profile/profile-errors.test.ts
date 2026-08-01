import { describe, it, expect } from 'vitest';
import { ApiError } from '@/lib/api/client';
import { profileApiErrorMessage, isWrongCurrentPasswordError } from './profile-errors';

// `t` mimics a next-intl translator scoped to `profile`: it returns the key
// itself, so assertions check which key the helper chose (not the translation).
const t = (key: string) => `profile.${key}`;

describe('profileApiErrorMessage (GT-11969)', () => {
  it('5xx -> profile.errors.internal (never the English "Internal server error")', () => {
    const err = new ApiError(500, 'Internal server error', { error: { code: 'internal_error', message: 'Internal server error' } });
    expect(profileApiErrorMessage(err, 'pwd.changeFailed', t)).toBe('profile.errors.internal');
  });

  it('network failure (status 0) -> the already-localized requestFailedMessage carried in message', () => {
    const err = new ApiError(0, '请求失败，服务暂时不可用，请稍后重试', {});
    expect(profileApiErrorMessage(err, 'account.saveFailed', t)).toBe('请求失败，服务暂时不可用，请稍后重试');
  });

  it('English 4xx -> caller fallback key (never the raw English message)', () => {
    const err = new ApiError(400, 'Current password is incorrect', { error: { code: 'invalid_request', message: 'Current password is incorrect' } });
    expect(profileApiErrorMessage(err, 'pwd.changeFailed', t)).toBe('profile.pwd.changeFailed');
  });

  it('CJK 4xx -> pass through the backend-provided localized message (e.g. password reuse)', () => {
    const err = new ApiError(400, '新密码不能与近期使用过的密码相同', { error: { code: 'invalid_request', message: '新密码不能与近期使用过的密码相同' } });
    expect(profileApiErrorMessage(err, 'pwd.changeFailed', t)).toBe('新密码不能与近期使用过的密码相同');
  });

  // GT-12614: profile 侧校验错误已改成"稳定错误码 + 英文 message"。若不先按
  // 错误码取词条，这些错误会落到 CJK 判断之外、退化成笼统的兜底文案 ——
  // 用户从"密码错误"变成"保存失败"，页面不报错但信息量丢了。
  it('coded 4xx -> apiErrors.<code> 文案，优先于英文 message 的兜底', () => {
    const err = new ApiError(400, 'incorrect password', {
      error: { code: 'profile.password_incorrect', message: 'incorrect password', params: { field: 'password' } },
    });
    const tRoot = (key: string) => (key === 'apiErrors.profile.password_incorrect' ? '密码错误' : key);
    expect(profileApiErrorMessage(err, 'pwd.changeFailed', t, tRoot)).toBe('密码错误');
  });

  it('未命中错误码时回到原有行为（兜底 key），不显示后端英文', () => {
    const err = new ApiError(400, 'something else', {
      error: { code: 'profile.brand_new_code', message: 'something else' },
    });
    const tRoot = (key: string) => key; // next-intl 缺 key 时原样返回
    expect(profileApiErrorMessage(err, 'pwd.changeFailed', t, tRoot)).toBe('profile.pwd.changeFailed');
  });

  it('non-ApiError -> caller fallback key', () => {
    expect(profileApiErrorMessage(new Error('boom'), 'account.saveFailed', t)).toBe('profile.account.saveFailed');
    expect(profileApiErrorMessage('weird', 'account.saveFailed', t)).toBe('profile.account.saveFailed');
  });
});

describe('isWrongCurrentPasswordError (GT-11969)', () => {
  it('true for 400 "Current password is incorrect"', () => {
    expect(isWrongCurrentPasswordError(new ApiError(400, 'Current password is incorrect', {}))).toBe(true);
  });
  it('false for 400 password-reuse (CJK, no current/old)', () => {
    expect(isWrongCurrentPasswordError(new ApiError(400, '新密码不能与近期使用过的密码相同', {}))).toBe(false);
  });
  it('false for 500 (not a wrong-password case)', () => {
    expect(isWrongCurrentPasswordError(new ApiError(500, 'Internal server error', {}))).toBe(false);
  });
  it('false for non-ApiError', () => {
    expect(isWrongCurrentPasswordError(new Error('Current password is incorrect'))).toBe(false);
  });
});
