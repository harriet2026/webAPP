import { describe, expect, it, vi } from 'vitest';
import type { ApiRequestFn } from './client';
import { getPhishingControl, putPhishingControl } from './phishing-control';
import { getPhishingConfig, putPhishingConfig } from './phishing-config';
import { getPhishingAnalysisConfig, putPhishingAnalysisConfig } from './phishing-analysis-config';
import {
  createAdmissionRule,
  listAdmissionRules,
  updateAdmissionRule,
} from './phishing-admission-rules';
import { getDetectionLogs } from './phishing-detection';

const request = (response: unknown = {}) =>
  vi.fn(async () => response) as unknown as ApiRequestFn;

describe('phishing adapters', () => {
  it('reads and updates the versioned control state through its product endpoint', async () => {
    const fake = request({ enabled: false, desired_state: 'disabled', runtime_state: 'stopped', revision: 7 });

    await getPhishingControl(fake);
    await putPhishingControl({ enabled: true, expected_revision: 7, operation_id: 'op-1' }, fake);

    expect(fake).toHaveBeenNthCalledWith(1, '/phishing-agent/control');
    expect(fake).toHaveBeenNthCalledWith(2, '/phishing-agent/control', {
      method: 'PUT',
      body: { enabled: true, expected_revision: 7, operation_id: 'op-1' },
    });
  });

  it('saves runtime and risk policy atomically with one aggregate PUT', async () => {
    const fake = request({});
    const body = {
      risk_policy: {
        cutoffs: { low: 40, medium: 70, high: 90 },
        policies: {
          suspicious: { base_disposition: 'proceed' as const },
          low: { base_disposition: 'proceed' as const, mark_positions: ['subject_prefix' as const], mark_text: '[可疑]' },
          medium: { base_disposition: 'quarantine' as const },
          high: { base_disposition: 'discard' as const },
        },
        expected_version: 3,
      },
      runtime_policy: {
        run_mode: 'realtime' as const,
        observe_action: 'accept' as const,
        observe_mark_enabled: false,
        timeout_minutes: 5,
        max_recheck_minutes: 30,
        timeout_async_enabled: true,
        expected_version: 4,
      },
    };

    await getPhishingConfig(fake);
    await putPhishingConfig(body, fake);

    expect(fake).toHaveBeenNthCalledWith(1, '/phishing-agent/config');
    expect(fake).toHaveBeenNthCalledWith(2, '/phishing-agent/config', { method: 'PUT', body });
    expect(fake).toHaveBeenCalledTimes(2);
  });

  it('keeps analysis config on its independent versioned endpoint', async () => {
    const fake = request({});
    const body = {
      netdisk_domain: true,
      netdisk_extract: true,
      netdisk_spoof: false,
      expected_version: 2,
    };

    await getPhishingAnalysisConfig(fake);
    await putPhishingAnalysisConfig(body, fake);

    expect(fake).toHaveBeenNthCalledWith(1, '/phishing-agent/analysis-config');
    expect(fake).toHaveBeenNthCalledWith(2, '/phishing-agent/analysis-config', { method: 'PUT', body });
  });

  it('uses normalized admission DTOs and optimistic revisions', async () => {
    const listFake = request({ items: [{ id: 1, rule_uid: 'rule-1', revision: 'rev-1', name: 'R', directions: ['outbound'] }] });
    expect(await listAdmissionRules(listFake)).toHaveLength(1);

    const rule = {
      name: 'R',
      enabled: false,
      directions: ['outbound' as const],
      filter_on: true,
      sender_groups: ['group-uid'],
      sender_depts: ['/销售部'],
      sender_emails: ['user@example.com'],
      require_url: false,
      sender_first_seen: true,
      require_qrcode: true,
      require_executable: true,
    };
    const writeFake = request(rule);
    await createAdmissionRule(rule, writeFake);
    await updateAdmissionRule(8, { ...rule, expected_revision: 'rev-8' }, writeFake);

    expect(writeFake).toHaveBeenNthCalledWith(1, '/phishing-agent/admission-rules', { method: 'POST', body: rule });
    expect(writeFake).toHaveBeenNthCalledWith(2, '/phishing-agent/admission-rules/8', {
      method: 'PUT',
      body: { ...rule, expected_revision: 'rev-8' },
    });
  });

  it('sends mail statuses to the server as repeated query parameters', async () => {
    const fake = request({ items: [], total: 0, page: 1, page_size: 20 });

    await getDetectionLogs({ page: 1, mail_status: ['audit_pending', 'delivered'] }, fake);

    const path = vi.mocked(fake).mock.calls[0][0];
    expect(path).toContain('mail_status=audit_pending');
    expect(path).toContain('mail_status=delivered');
  });
});
