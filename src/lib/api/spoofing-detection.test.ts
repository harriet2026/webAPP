import { describe, expect, it, vi } from 'vitest';
import type { ApiRequestFn } from './client';
import { getSpoofingLogs, getSpoofingStats, listSpoofBrands, listSpoofPersons, previewSpoofBrandNotification, previewSpoofPersonNotification } from './spoofing-detection';
import type { SpoofBrandConfig, SpoofNotificationPreviewResponse, SpoofPersonConfig } from '@/types/spoofing-detection';

const response: SpoofNotificationPreviewResponse = {
  from: 'security-alert@osgateway.local',
  to: 'secops@corp.test',
  subject: 'preview',
  text: 'body',
  mime: 'mime',
  content_type: 'text/plain; charset=utf-8',
};

const person: SpoofPersonConfig = {
  display_name: 'Finance Director',
  category: 'finance',
  protection_level: 'high',
  sensitivity: 85,
  confidence_threshold: 80,
  legit_emails: [{ email: 'finance@corp.test', match_type: 'exact' }],
  disposition: { mode: 'standard', action: 'quarantine', mark_style: ['subject'], notify: true },
  enabled: true,
  observe_mode: false,
};

const brand: SpoofBrandConfig = {
  brand_name: 'Coremail',
  protected_domains: [{ domain: 'coremail.test', edit_distance_threshold: 3 }],
  keywords: [],
  confidence_threshold: 80,
  disposition: { mode: 'standard', action: 'quarantine', mark_style: ['subject'], notify: true },
  enabled: true,
  observe_mode: false,
};

describe('spoof notification preview API', () => {
  it('posts a person draft to the person preview endpoint', async () => {
    const request = vi.fn(async () => response) as unknown as ApiRequestFn;
    await expect(previewSpoofPersonNotification({ person, language: 'en' }, request)).resolves.toEqual(response);
    expect(request).toHaveBeenCalledWith('/spoofing-agent/persons/notification-preview', {
      method: 'POST',
      body: { person, language: 'en' },
    });
  });

  it('posts a brand draft to the brand preview endpoint', async () => {
    const request = vi.fn(async () => response) as unknown as ApiRequestFn;
    await expect(previewSpoofBrandNotification({ brand, language: 'zh' }, request)).resolves.toEqual(response);
    expect(request).toHaveBeenCalledWith('/spoofing-agent/brands/notification-preview', {
      method: 'POST',
      body: { brand, language: 'zh' },
    });
  });
});

describe('spoof detection-log API', () => {
  it('does not append an empty query marker to the stats endpoint', async () => {
    const request = vi.fn(async () => ({ today_detected: 0 })) as unknown as ApiRequestFn;
    await getSpoofingStats({}, request);
    expect(request).toHaveBeenCalledWith('/spoofing-agent/stats');
  });

  it('serializes repeated method and KPI drilldown filters', async () => {
    const listResponse = { items: [], total: 0, page: 1, page_size: 20 };
    const request = vi.fn(async () => listResponse) as unknown as ApiRequestFn;

    await expect(getSpoofingLogs({
      page: 1,
      page_size: 20,
      disposition: ['quarantine', 'reject'],
      spoof_method: ['display_name_spoof'],
      category: ['intercepted'],
    }, request)).resolves.toEqual(listResponse);
    expect(request).toHaveBeenCalledWith(
      '/spoofing-agent/detection-logs?page=1&page_size=20&disposition=quarantine&disposition=reject&spoof_method=display_name_spoof&category=intercepted',
    );
  });
});

describe('spoof person list API', () => {
  it('sends server-side pagination and list filters', async () => {
    const listResponse = { items: [], total: 0, page: 2, page_size: 100 };
    const request = vi.fn(async () => listResponse) as unknown as ApiRequestFn;

    await expect(listSpoofPersons({
      page: 2,
      page_size: 100,
      keyword: 'alice',
      protection_level: 'high',
      observe_mode: false,
    }, request)).resolves.toEqual(listResponse);
    expect(request).toHaveBeenCalledWith(
      '/spoofing-agent/persons?page=2&page_size=100&keyword=alice&protection_level=high&observe_mode=false',
    );
  });
});

describe('spoof brand list API', () => {
  it('sends server-side pagination and mode filtering', async () => {
    const listResponse = { items: [], total: 0, page: 2, page_size: 100 };
    const request = vi.fn(async () => listResponse) as unknown as ApiRequestFn;

    await expect(listSpoofBrands({
      page: 2,
      page_size: 100,
      keyword: 'corp.test',
      disposition_mode: 'strict',
    }, request)).resolves.toEqual(listResponse);
    expect(request).toHaveBeenCalledWith(
      '/spoofing-agent/brands?page=2&page_size=100&keyword=corp.test&disposition_mode=strict',
    );
  });
});
