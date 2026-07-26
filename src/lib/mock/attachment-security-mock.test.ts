import { describe, expect, it } from 'vitest';

import { dispatch, isMockable } from './dispatcher';

describe('attachment security mock routes', () => {
  it('covers every API needed by the four-tab drawer', () => {
    const configPath = '/config-overrides?config_file=attachd.cf&section_name=basic_limit_receive&page=1&limit=200';
    expect(isMockable('GET', configPath)).toBe(true);
    expect(isMockable('POST', '/config-overrides')).toBe(true);
    expect(isMockable('PUT', '/config-overrides/9000')).toBe(true);
    expect(isMockable('GET', '/attachment-security/antivirus/status')).toBe(true);
    expect(isMockable('POST', '/attachment-security/antivirus/update')).toBe(true);
    expect(isMockable('GET', '/attachment-security/password-book')).toBe(true);
    expect(isMockable('POST', '/attachment-security/password-book')).toBe(true);
    expect(isMockable('DELETE', '/attachment-security/password-book/1')).toBe(true);
  });

  it('returns the html_spec basic-limit defaults and persists an update', () => {
    const path = '/config-overrides?config_file=attachd.cf&section_name=basic_limit_receive&page=1&limit=200';
    const initial = dispatch({ method: 'GET', path });
    const initialItems = (initial.data as { items: Array<{ id: number; config_key: string; config_value: string }> }).items;
    expect(Object.fromEntries(initialItems.map((item) => [item.config_key, item.config_value]))).toMatchObject({
      attachment_count_max: '10',
      attachment_size_max_kb: '10240',
      nested_zip_count_max: '2',
      nested_file_count_max: '20',
      nested_level_max: '2',
      scan_timeout_sec: '30',
      exceed_action: 'quarantine',
    });

    const count = initialItems.find((item) => item.config_key === 'attachment_count_max');
    expect(count).toBeDefined();
    dispatch({ method: 'PUT', path: `/config-overrides/${count!.id}`, body: { config_value: '12', value_type: 'int' } });
    const updated = dispatch({ method: 'GET', path });
    const updatedItems = (updated.data as typeof initial.data as { items: typeof initialItems }).items;
    expect(updatedItems.find((item) => item.config_key === 'attachment_count_max')?.config_value).toBe('12');
  });

  it('starts with the browser-verified password row and supports add/delete', () => {
    const initial = dispatch({ method: 'GET', path: '/attachment-security/password-book' });
    expect(initial.data).toEqual(expect.arrayContaining([
      expect.objectContaining({ password: 'company2024!', created_at: '2024-01-15T00:00:00+08:00' }),
    ]));

    const created = dispatch({
      method: 'POST',
      path: '/attachment-security/password-book',
      body: { password: 'test@123', description: null },
    });
    const id = (created.data as { id: number }).id;
    expect(dispatch({ method: 'GET', path: '/attachment-security/password-book' }).data).toEqual(
      expect.arrayContaining([expect.objectContaining({ id, password: 'test@123' })]),
    );

    expect(dispatch({ method: 'DELETE', path: `/attachment-security/password-book/${id}` }).status).toBe(204);
    expect(dispatch({ method: 'GET', path: '/attachment-security/password-book' }).data).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ id })]),
    );
  });
});
