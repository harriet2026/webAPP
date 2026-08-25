import { describe, expect, it } from 'vitest';
import registry from '@/lib/product-form/__fixtures__/registry_for_test.json';
import en from '../../../messages/en.json';
import ru from '../../../messages/ru.json';
import th from '../../../messages/th.json';
import zh from '../../../messages/zh.json';
import { mockTenants } from './fixtures';

const locales = { en, ru, th, zh } as const;
const mockCapabilityIDs = new Set(mockTenants.items.flatMap((tenant) => tenant.capability_flags ?? []));

describe('Mock 租户能力契约', () => {
  it('只使用产品注册表中可授权的能力 ID', () => {
    const grantableIDs = new Set(registry.filter((feature) => feature.grantable).map((feature) => feature.id));
    const invalid = [...mockCapabilityIDs].filter((id) => !grantableIDs.has(id));

    expect(invalid).toEqual([]);
  });

  it('每个能力 ID 在四语种中都有租户列表标签', () => {
    for (const [locale, messages] of Object.entries(locales)) {
      const capabilityMessages = messages.tenants.capability as Record<string, string>;
      const missing = [...mockCapabilityIDs].filter((id) => !capabilityMessages[id]);

      expect(missing, `${locale} 缺少 tenants.capability 标签`).toEqual([]);
    }
  });
});
