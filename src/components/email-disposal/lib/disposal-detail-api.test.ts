import { describe, expect, test, vi } from 'vitest';
import { addAttachmentHashRule, addUrlRule, disposeByObject } from './disposal-detail-api';
import type { ApiRequestFn } from '@/lib/api/client';

describe('disposeByObject', () => {
  test('omits final_type from the request body when undefined', async () => {
    const requestFn = vi.fn().mockResolvedValue({ results: [] }) as unknown as ApiRequestFn;
    await disposeByObject(42, 'obj-1', 'delete', undefined, requestFn);

    expect(requestFn).toHaveBeenCalledTimes(1);
    const [, opts] = (requestFn as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(opts.body).toEqual({ action: 'delete', mail_log_ids: [42], object_id: 'obj-1' });
    expect(opts.body).not.toHaveProperty('final_type');
  });

  test('includes final_type in the request body when set', async () => {
    const requestFn = vi.fn().mockResolvedValue({ results: [] }) as unknown as ApiRequestFn;
    await disposeByObject(42, 'obj-1', 'release', 'normal', requestFn);

    const [, opts] = (requestFn as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(opts.body).toEqual({ action: 'release', mail_log_ids: [42], object_id: 'obj-1', final_type: 'normal' });
  });
});

describe('addUrlRule', () => {
  test('domain field: page=url_protection, field=urls, operator=contain, value=domain', async () => {
    const requestFn = vi.fn().mockResolvedValue({}) as unknown as ApiRequestFn;
    await addUrlRule('evil.com', 'domain', requestFn);

    expect(requestFn).toHaveBeenCalledTimes(1);
    const [url, opts] = (requestFn as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(url).toContain('/unified-rules');
    expect(opts.method).toBe('POST');
    expect(opts.body).toMatchObject({
      page: 'url_protection',
      rule_class: 'action',
      stage: 'data',
      action: 'reject',
      condition_tree: { type: 'condition', field: 'urls', operator: 'contain', value: 'evil.com' },
    });
  });

  test('url field: same field/operator, full URL as value', async () => {
    const requestFn = vi.fn().mockResolvedValue({}) as unknown as ApiRequestFn;
    await addUrlRule('https://evil.com/phish', 'url', requestFn);

    const [, opts] = (requestFn as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(opts.body.condition_tree).toEqual({
      type: 'condition', field: 'urls', operator: 'contain', value: 'https://evil.com/phish',
    });
  });
});

describe('addAttachmentHashRule', () => {
  test('page=attachment_security, stage=sideline, field=attachment_md5, operator=eq', async () => {
    const requestFn = vi.fn().mockResolvedValue({}) as unknown as ApiRequestFn;
    await addAttachmentHashRule('deadbeef', requestFn);

    expect(requestFn).toHaveBeenCalledTimes(1);
    const [url, opts] = (requestFn as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(url).toContain('/unified-rules');
    expect(opts.method).toBe('POST');
    expect(opts.body).toMatchObject({
      page: 'attachment_security',
      rule_class: 'action',
      stage: 'sideline',
      action: 'reject',
      condition_tree: { type: 'condition', field: 'attachment_md5', operator: 'eq', value: 'deadbeef' },
    });
  });
});
