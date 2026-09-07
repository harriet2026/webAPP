import { describe, expect, it, vi } from 'vitest';
import type { ApiRequestFn, PublicationPendingResponse } from './client';
import { isPublicationPendingResponse } from './client';
import { committedSimilarDetection, putSimilarDetection } from './similar-detection';
import { putPhishingConfig } from './phishing-config';
import { putURLProtectionSettings } from './url-protection';
import { putDisposalSettings } from './disposal-settings';
import { putAuthSpoofingConfig } from './auth-spoofing';
import { deleteTenantLLMSetting, isTenantLLMDeletePendingResponse, upsertTenantLLMSetting } from './tenants';
import { putSmtpConfig } from './monitoring';
import { setMailAdmissionPolicyEnabled } from './mail-admission';
import { setRecipientCheckConfig, setRecipientLimitConfig } from './behavior-control';
import { saveTenantAttachmentSecuritySettings } from './attachment-security';
import { putPasswordPolicySettings } from './password-policy';
import { applyCommittedLoginPolicy, putLoginPolicy, type LoginPolicyResponse } from './login-policy';
import { putPhishingAnalysisConfig } from './phishing-analysis-config';
import { putIntentEngineConfig } from './intent-engine';
import { setSecurityModuleEnabled } from './security-modules';
import { setModuleEnabled as setAdvancedRulesModuleEnabled } from './advanced-rules';
import {
  acceptScopedConfigMutation,
  committedScopedConfigView,
  patchPlatformConfig,
  patchTenantConfig,
  type ScopedConfigView,
} from './scoped-configs';
import type { SimilarDetectionPutRequest } from '@/components/security/similar-detection/types';

const pending: PublicationPendingResponse = {
  committed: true,
  published: false,
  status: 'publication_pending',
};

function pendingRequest(): ApiRequestFn {
  return vi.fn().mockResolvedValue(pending) as unknown as ApiRequestFn;
}

describe('typed configuration publication acknowledgements', () => {
  it('derives the next similar-detection CAS version without treating expected_version as a response field', () => {
    const request: SimilarDetectionPutRequest = {
      mode: 'aggregate',
      enabled_directions: [],
      aggregate: {} as never,
      similar_email: {} as never,
      same_subject: {} as never,
      subject_normalization: {} as never,
      expected_version: 7,
    };
    const committed = committedSimilarDetection(request);
    expect(committed.version).toBe(8);
    expect(committed).not.toHaveProperty('expected_version');
  });

  it.each([
    ['similar detection', (request: ApiRequestFn) => putSimilarDetection({} as never, request)],
    ['phishing config', (request: ApiRequestFn) => putPhishingConfig({} as never, request)],
    ['URL protection', (request: ApiRequestFn) => putURLProtectionSettings({}, request)],
    ['disposal settings', (request: ApiRequestFn) => putDisposalSettings({} as never, request)],
    ['auth spoofing', (request: ApiRequestFn) => putAuthSpoofingConfig({} as never, request)],
    ['tenant LLM', (request: ApiRequestFn) => upsertTenantLLMSetting(832, {} as never, request)],
    ['tenant LLM delete', (request: ApiRequestFn) => deleteTenantLLMSetting(832, request)],
    ['alert SMTP', (request: ApiRequestFn) => putSmtpConfig({} as never, request)],
    ['password policy', (request: ApiRequestFn) => putPasswordPolicySettings({} as never, request)],
    ['login policy', (request: ApiRequestFn) => putLoginPolicy({}, 832, request)],
    ['mail admission', (request: ApiRequestFn) => setMailAdmissionPolicyEnabled(true, request)],
    ['legacy recipient limit', (request: ApiRequestFn) => setRecipientLimitConfig({} as never, request)],
    ['legacy recipient check', (request: ApiRequestFn) => setRecipientCheckConfig({} as never, request)],
    [
      'tenant attachment settings',
      (request: ApiRequestFn) => saveTenantAttachmentSecuritySettings({} as never, request),
    ],
  ])('%s preserves the acknowledgement as a distinct union member', async (_name, invoke) => {
    const result = await invoke(pendingRequest());
    expect(result).toEqual(pending);
    expect(isPublicationPendingResponse(result)).toBe(true);
  });

  it('explicitly ignored response helpers accept committed publication pending', async () => {
    await expect(putIntentEngineConfig({} as never, pendingRequest())).resolves.toBeUndefined();
    await expect(setSecurityModuleEnabled('url_protection', true, pendingRequest())).resolves.toBeUndefined();
  });

  it('requires the tenant LLM delete acknowledgement to carry its inherited fallback', () => {
    expect(isTenantLLMDeletePendingResponse(pending)).toBe(false);
    expect(
      isTenantLLMDeletePendingResponse({
        ...pending,
        inherited: true,
        has_explicit_api_key: false,
        setting: {
          tenant_id: 832,
          base_url: 'https://platform.example/v1',
          model: 'platform-model',
          enabled: true,
          insecure_skip_verify: false,
        },
      }),
    ).toBe(true);
  });

  it('versioned and toggle helpers retain publication pending for their callers', async () => {
    await expect(putPhishingAnalysisConfig({} as never, pendingRequest())).resolves.toEqual(pending);
    await expect(setAdvancedRulesModuleEnabled(true, pendingRequest())).resolves.toEqual(pending);
  });

  it.each([
    ['platform', (request: ApiRequestFn) => patchPlatformConfig('antispam', 4, [], request)],
    ['tenant', (request: ApiRequestFn) => patchTenantConfig('antispam', 4, [], request)],
  ])('scoped %s patch retains publication pending', async (_scope, invoke) => {
    await expect(invoke(pendingRequest())).resolves.toEqual(pending);
  });

  it('advances a pending scoped patch locally without reading an old snapshot', () => {
    const current: ScopedConfigView = {
      published: true,
      stored: {
        namespace: 'antispam',
        scope_kind: 'platform',
        scope_id: 0,
        schema_version: 1,
        version: 4,
        document: { auth: { enabled: true }, obsolete: 'remove-me' },
        checksum: 'old',
        updated_at: '2026-08-28T00:00:00Z',
      },
      effective: {
        namespace: 'antispam',
        tenant_id: 0,
        schema_version: 1,
        snapshot_version: 'old',
        platform_version: 4,
        tenant_version: 0,
        hash: 'old',
        document: { auth: { enabled: true }, obsolete: 'remove-me' },
        provenance: {},
      },
    };

    const committed = committedScopedConfigView(current, [
      { op: 'set', path: 'auth.enabled', value: false },
      { op: 'set', path: 'auth.mode', value: 'strict' },
      { op: 'remove', path: 'obsolete' },
    ]);

    expect(committed.published).toBe(false);
    expect(committed.stored?.version).toBe(5);
    expect(committed.effective.platform_version).toBe(5);
    expect(committed.stored?.document).toEqual({
      auth: { enabled: false, mode: 'strict' },
    });
    expect(committed.effective.document).toEqual({
      auth: { enabled: false, mode: 'strict' },
    });
    expect(current.stored?.document).toEqual({
      auth: { enabled: true },
      obsolete: 'remove-me',
    });
  });

  it('does not trust the stale effective half of a direct scoped-config 202 response', () => {
    const current: ScopedConfigView = {
      published: true,
      stored: {
        namespace: 'antispam',
        scope_kind: 'platform',
        scope_id: 0,
        schema_version: 1,
        version: 4,
        document: { enabled: true },
        checksum: 'old',
        updated_at: '2026-08-28T00:00:00Z',
      },
      effective: {
        namespace: 'antispam',
        tenant_id: 0,
        schema_version: 1,
        snapshot_version: 'old',
        platform_version: 4,
        tenant_version: 0,
        hash: 'old',
        document: { enabled: true },
        provenance: {},
      },
    };
    const direct202: ScopedConfigView = {
      ...current,
      published: false,
      stored: {
        ...current.stored!,
        version: 5,
        checksum: 'committed',
        document: { enabled: false },
      },
      // Manager publication failed, so the direct handler still sees v4 here.
      effective: current.effective,
    };

    const accepted = acceptScopedConfigMutation(current, direct202, [{ op: 'set', path: 'enabled', value: false }]);

    expect(accepted.published).toBe(false);
    expect(accepted.stored?.version).toBe(5);
    expect(accepted.stored?.checksum).toBe('committed');
    expect(accepted.effective.platform_version).toBe(5);
    expect(accepted.effective.document.enabled).toBe(false);
  });

  it('advances tenant_version for a first tenant override returned as a full 202 view', () => {
    const current: ScopedConfigView = {
      published: true,
      effective: {
        namespace: 'attachd',
        tenant_id: 832,
        schema_version: 1,
        snapshot_version: 'old',
        platform_version: 9,
        tenant_version: 0,
        hash: 'old',
        document: { image: { enabled: false } },
        provenance: {},
      },
    };
    const direct202: ScopedConfigView = {
      ...current,
      published: false,
      stored: {
        namespace: 'attachd',
        scope_kind: 'tenant',
        scope_id: 832,
        schema_version: 1,
        version: 1,
        document: { image: { enabled: true } },
        checksum: 'tenant-v1',
        updated_at: '2026-08-28T00:00:00Z',
      },
    };

    const accepted = acceptScopedConfigMutation(current, direct202, [
      { op: 'set', path: 'image.enabled', value: true },
    ]);

    expect(accepted.stored?.version).toBe(1);
    expect(accepted.effective.platform_version).toBe(9);
    expect(accepted.effective.tenant_version).toBe(1);
    expect(accepted.effective.document).toEqual({ image: { enabled: true } });
  });

  it('applies a pending login-policy acknowledgement to the cached response', () => {
    const policy = {
      minLength: 8,
      minCharClasses: 2,
      historyLimit: 0,
      passwordMaxAgeDays: 0,
      sessionTimeoutSecs: 3600,
      maxOnline: 0,
      overflowPolicy: 'kick_earliest' as const,
      ipMode: 'none' as const,
      maxLoginAttempts: 5,
      lockoutMinutes: 15,
      captchaAfterFailures: 2,
      reloginAfterChange: false,
      forceTwoFactor: false,
      twoFactorEnabled: false,
    };
    const current: LoginPolicyResponse = {
      scope: 'platform',
      defaults: policy,
      configured: null,
      effective: policy,
      sources: {},
      tiers: {},
      ipRules: [],
    };

    const committed = applyCommittedLoginPolicy(current, {
      minLength: 12,
      forceTwoFactor: true,
      maxLoginAttempts: 7,
    });

    expect(committed.defaults.minLength).toBe(8);
    expect(committed.configured?.minLength).toBe(12);
    expect(committed.effective.forceTwoFactor).toBe(true);
    expect(committed.effective.twoFactorEnabled).toBe(true);
    expect(committed.effective.maxLoginAttempts).toBe(7);
  });

  it('applies a pending login-policy reset from System Default', () => {
    const defaults = {
      minLength: 10,
      minCharClasses: 2,
      historyLimit: 3,
      passwordMaxAgeDays: 0,
      sessionTimeoutSecs: 86400,
      maxOnline: 0,
      overflowPolicy: 'kick_earliest' as const,
      ipMode: 'none' as const,
      maxLoginAttempts: 5,
      lockoutMinutes: 15,
      captchaAfterFailures: 2,
      reloginAfterChange: false,
      forceTwoFactor: false,
      twoFactorEnabled: false,
    };
    const current: LoginPolicyResponse = {
      scope: 'tenant',
      defaults,
      configured: { minLength: 20 },
      effective: { ...defaults, minLength: 20 },
      sources: { minLength: 'tenant' },
      tiers: {},
      ipRules: [],
    };

    const committed = applyCommittedLoginPolicy(current, { minLength: null });

    expect(committed.configured).not.toHaveProperty('minLength');
    expect(committed.effective.minLength).toBe(10);
    expect(committed.sources.minLength).toBe('system_default');
  });
});
