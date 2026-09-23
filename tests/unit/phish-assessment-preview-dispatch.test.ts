import { afterEach, describe, expect, it, vi } from 'vitest';
import { apiRequest } from '@/lib/api/client';
import type { DetectionLogDetail, DetectionLogListResponse } from '@/types/phishing-detection';
import { cliMockDetail } from '../fixtures/phish-ui-real-data/mock-detail';
import { cliReportPropsZh } from '../fixtures/phish-ui-real-data/zh';
import { dispatchPhishAssessmentPreview } from '../fixtures/phish-ui-real-data/dispatch';

function enablePreview() {
  vi.stubEnv('NODE_ENV', 'development');
  vi.stubEnv('NEXT_PUBLIC_PHISH_ASSESSMENT_PREVIEW', '1');
  localStorage.setItem('osgateway_mock_enabled', '1');
  localStorage.setItem('osgateway_demo_session', '1');
}

afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); localStorage.clear(); });

describe('independent webapp phishing preview profile', () => {
  it('serves all three independent details through the real API client only after opting in', async () => {
    enablePreview();
    const fetch = vi.fn(); vi.stubGlobal('fetch', fetch);
    const list = await apiRequest<DetectionLogListResponse>('/phishing-agent/detection-logs?page=1');
    expect(list.items).toHaveLength(3);
    const detail = await apiRequest<DetectionLogDetail>('/phishing-agent/detection-logs/mock-cli-mail8');
    expect(detail.summary.subject).toContain('Mock 定级/处置');
    expect(detail.summary.confidence).toBe(0.88);
    expect(detail.summary.risk_level).toBe('medium');
    expect(detail.summary.policy_disposition).toBe('quarantine');
    expect(detail.summary.recipient_dispositions[0].status).toBe('quarantined');
    expect(detail.investigation!.result!.assessment_report).toEqual(cliReportPropsZh.result.assessment_report);
    expect(fetch).not.toHaveBeenCalled();
  });

  it.each(['production', 'no-preview', 'no-demo'])('keeps the existing mock set for %s', async (mode) => {
    enablePreview();
    if (mode === 'production') vi.stubEnv('NODE_ENV', 'production');
    if (mode === 'no-preview') vi.stubEnv('NEXT_PUBLIC_PHISH_ASSESSMENT_PREVIEW', '');
    if (mode === 'no-demo') localStorage.removeItem('osgateway_demo_session');
    const list = await apiRequest<DetectionLogListResponse>('/phishing-agent/detection-logs');
    expect(list.items.some((item) => item.sideline_id === cliMockDetail.summary.sideline_id)).toBe(false);
  });

  it('keeps actual API requests intact when mock mode is disabled', async () => {
    enablePreview(); localStorage.removeItem('osgateway_mock_enabled');
    const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ items: [], total: 0 })));
    vi.stubGlobal('fetch', fetch);
    await apiRequest('/phishing-agent/detection-logs');
    expect(fetch).toHaveBeenCalledOnce();
  });

  it('filters and pages the fixture list while leaving unrelated routes alone', () => {
    const result = dispatchPhishAssessmentPreview('GET', '/phishing-agent/detection-logs?keyword=Mock&page_size=1');
    expect(result?.data).toEqual(expect.objectContaining({ total: 1, items: [cliMockDetail.summary] }));
    expect(dispatchPhishAssessmentPreview('GET', '/phishing-agent/config')).toBeUndefined();
    expect(dispatchPhishAssessmentPreview('POST', '/phishing-agent/detection-logs')).toBeUndefined();
  });
});
